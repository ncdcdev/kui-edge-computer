const Tesseract = require('tesseract.js');
const co = require('co');
const gm = require('gm');
const PNG = require('pngjs').PNG;
const fs = require('fs');
const config = require('./config');
const account = require('./account');
const AppPot = require('./apppot-sdk-lite');

const indexFile = process.argv[2];
const imageFile = process.argv[3];
const macAddr = process.argv[4];
const siteIdFile = process.argv[5];
const isSkip = process.argv[6];

const siteId = fs.readFileSync(siteIdFile, {
  encoding: 'utf8'
});

const geometries = {
  kuiNumber: {
    width: 100,
    height: 16,
    x: 62,
    y: 10
  },
  status1: {
    width: 51,
    height: 16,
    x: 454,
    y: 113
  },
  status2: {
    width: 60,
    height: 16,
    x: 505,
    y: 113
  },
  status3: {
    width: 75,
    height: 16,
    x: 565,
    y: 113
  }
};

function getNumberArea(imgPath){
  return new Promise((resolve, reject)=>{
    const kuiArea = geometries.kuiNumber;
    gm(imgPath).crop(
      kuiArea.width,
      kuiArea.height,
      kuiArea.x,
      kuiArea.y
    )
    .fill('#fff')
    .drawRectangle(45, 0, 54, 16)
    .toBuffer('JPG', (err, buffer) =>{
      if(err){
        console.log(err);
        reject(err);
      }else{
        resolve(buffer);
      }
    })
  });
}

function recognize(buffer){
  return new Promise((resolve, reject)=>{
    console.log('recognize number');
    t = Tesseract.create({
      langPath: __dirname
    });
    t.recognize(buffer,{
      lang: 'eng',
      tessedit_char_whitelist: '0123456789-',
    })
      .progress(p=>{
        //console.log(p);
      })
      .then(result=>{
        const regexp = /(\d+) (\d+)/;
        const matches = result.text.match(regexp);
        resolve(matches[1] + '-' + matches[2]);
      })
      .catch(e=>{
        console.log(e);
        reject(e);
      })
  });
}

function getStatus(imgPath, area){
  return new Promise((resolve, reject)=>{
    console.log('get status');
    gm(imgPath)
    .setFormat('pgm')
    .crop(
      area.width,
      area.height,
      area.x,
      area.y
    )
    .resize(1, 1, "!")
    .toBuffer((err, buffer) =>{
      if(err){
        console.log(err);
        reject(err);
      }else{
        const brightness = buffer.readUInt8(buffer.length - 1);
        resolve( brightness < 230 );
      }
    })
  });
}

function all(path){
  return Promise.all([
    getNumberArea(path).then(recognize),
    getStatus(path, geometries.status1),
    getStatus(path, geometries.status2),
    getStatus(path, geometries.status3)
  ]);
}

function updateIndex(){
  const matches = imageFile.match(/.*IMG(\d+).*/);
  const index = parseInt( matches[1] );

  return new Promise((resolve, reject) => {
    fs.writeFile(indexFile, index, (err) => {
      if(err) {
        reject(err);
      }else{
        resolve(index);
      }
    });
  });
}

function searchKui(ajax, kuiNumber){
  const searchKuiQuery = {
    'from': {
      'phyName' :'Kui',
      'alias' :'Kui'
    },
    'where': {
      'expression': {
        'source': '#Kui.kuiNumber = ? and #Kui.siteId = ?',
        'params': [kuiNumber, siteId]
      }
    }
  };
  return new Promise((resolve, reject)=>{
    ajax.post('data/Kui')
      .send(searchKuiQuery)
      .end(AppPot.Ajax.end((obj)=>{
          resolve(obj.Kui);
        }, (err)=>{
          if(err.response && err.response.statusCode == 404){
            resolve([]);
          }else{
            reject(err);
          }
        })
      );
  });
}

function buildKuiHitmachineData(kuiId, recognizedData, fileName){
  let dataType = -1;
  if( recognizedData[1] && !recognizedData[2] && !recognizedData[3] ){
    dataType = 0;
  }else if(recognizedData[3]){
    dataType = 1;
  }
  if( dataType < 0 ){
    return {failed:true};
  }

  return {
    scopeType: 3,
    createTime: Date.now()/1000,
    updateTime: Date.now()/1000,
    kuiId: kuiId,
    dataType: dataType,
    fileName: fileName
  };
}

function sendIndex(ajax, index){
  const query = {
    'from': {
      'phyName': 'Machine',
      'alias': 'Machine'
    },
    'where': {
      'expression': {
        'source': '#Machine.macAddress = ?',
        'params': [macAddr]
      }
    }
  };
  return new Promise((resolve, reject) => {
    ajax.post('data/Machine')
      .send(query)
      .end(AppPot.Ajax.end((obj) => {
        const machine = obj.Machine[0];
        ajax.post('data/batch/updateData')
          .send({
            objectName: 'Machine',
            data: [{
              objectId: machine.objectId,
              serverUpdateTime: machine.serverUpdateTime,
              index: index,
              overrideIndex: 0,
              updateTime: Math.floor(Date.now() / 1000)
            }]
          })
          .end(AppPot.Ajax.end((obj) => {
            resolve();
          }));
      }, (err) => {
        reject(err);
      }));
  });
}

function insertKuiHitMachineData(ajax, data){
  return new Promise((resolve, reject)=>{
    ajax.post('data/batch/addData')
      .send({
        objectName: 'KuiHitMachineData',
        data: [data]
      })
      .end(AppPot.Ajax.end((obj)=>{
          resolve(obj.KuiHitMachineData);
        }, (err)=>{
          if(err.response && err.response.statusCode == 404){
            resolve([]);
          }else{
            reject(err);
          }
        })
      );
  });
}


co(function*(){
  console.log('-----start');
  const filePath = __dirname + '/' + imageFile;


  // AppPot API呼び出し準備
  const authInfo = new AppPot.AuthInfo();
  const conf = new AppPot.Config(config, macAddr);
  const ajax = new AppPot.Ajax(authInfo, conf);
  const authenticator = new AppPot.LocalAuthenticator(authInfo, conf, ajax);
  const File = AppPot.getFileClass(authInfo, conf, ajax);
  const log = (msg, level) => {
    return new Promise( (resolve, reject)=>{
      ajax.post('logs')
        .send({
          message: msg,
          logLevel: level || 'MONITOR'
        })
        .end(AppPot.Ajax.end(resolve, reject));
    });
  };

  // ログイン
  yield authenticator.login(account.username, account.password);

  yield log('recognize_upload.js logined ' + imageFile);

  if(isSkip == '1'){
    const index = yield updateIndex();
    yield sendIndex(ajax, index);
    process.exit(5);
  }

  const result = yield all(filePath);
  console.log('--------');
  console.log(result[0] + ' ' + result[1] + ' ' + result[2] + ' ' + result[3]);
  console.log('--------');
  const matches = result[0].match(/(\d{3})-(\d{3})/);
  if(!matches){
    const index = yield updateIndex();
    yield sendIndex(ajax, index);
    yield log('recognize_upload.js finish recognize error' + imageFile, 'ERROR');
    console.log('-----finish recognize error');
    process.exit(1);
  }
  const kuiNumber = parseInt( matches[2] );

  // 杭データ確認
  const kuiList = yield searchKui(ajax, kuiNumber);
  if(kuiList.length == 0){
    const index = yield updateIndex();
    yield sendIndex(ajax, index);
    yield log('recognize_upload.js finish kui not found kuiNumber: ' + kuiNumber + ' ' + imageFile, 'ERROR');
    console.log('-----finish kui not found');
    process.exit(3);
  }

  // 画像アップロード
  const fileContent = fs.readFileSync(filePath);
  const fileName = require('path').basename(filePath);
  const file = yield File.create(fileName, fileContent);

  // データ登録
  const kuiHMD = yield buildKuiHitmachineData(kuiList[0].objectId, result, file.name);
  if(kuiHMD.failed){
    const index = yield updateIndex();
    yield sendIndex(ajax, index);
    console.log('-----finish ignore kui number');
    yield log('recognize_upload.js finish ignore status kuiNumber: ' + kuiNumber + ' ' + imageFile);
    process.exit(4);
  }
  const kuiHMDResult = yield insertKuiHitMachineData(ajax, kuiHMD);
  const index = yield updateIndex();
  yield sendIndex(ajax, index);
  yield log('recognize_upload.js complete kuiNumber: ' + kuiNumber + ' ' + imageFile);
  console.log('-----complete');
  process.exit(0);
})
.catch(error=>{
  console.log(error);
  console.log('-----finish unknown error');
  process.exit(2);
});
