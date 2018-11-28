const Tesseract = require('tesseract.js');
const co = require('co');
const gm = require('gm');
const PNG = require('pngjs').PNG;
const fs = require('fs');
const path = require('path');
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

function* updateIndex(index){
  yield new Promise((resolve, reject) => {
    fs.writeFile(indexFile, index, (err) => {
      if(err) {
        reject(err);
      }else{
        resolve(index);
      }
    });
  });
  yield sendIndex(index);
}

function searchKui(kuiNumber){
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

function getDataType(recognizedData) {
  if( recognizedData[1] && !recognizedData[2] && !recognizedData[3] ){
    return 0;
  }else if(recognizedData[3]){
    return 1;
  }
  return false;
}

function buildKuiHitmachineData(kuiId, dataType, fileName, dateTime){
  const _dateTime = dateTime ? dateTime : Date.now()/1000;
  return {
    scopeType: 3,
    createTime: _dateTime,
    updateTime: _dateTime,
    kuiId: kuiId,
    dataType: dataType,
    fileName: fileName,
    isAutoUploaded: 1
  };
}

function sendIndex(index){
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

function insertKuiHitMachineData(data){
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

function getMachineType(siteId) {
  const searchMachineQuery = {
    'from': {
      'phyName' :'SiteMethod',
      'alias' :'SiteMethod'
    },
    'where': {
      'expression': {
        'source': '#SiteMethod.siteId = ?',
        'params': [siteId]
      }
    }
  };
  return new Promise((resolve, reject)=>{
    ajax.post('data/SiteMethod')
      .send(searchMachineQuery)
      .end(AppPot.Ajax.end((obj)=>{
          resolve(obj.SiteMethod.kuiHitMachineManagerId);
        }, (err)=>{
          reject(err);
        })
      );
  });
}

function* exitWithRecognizeError(index) {
  if (index !== undefined && index !== null && index !== false) {
    yield updateIndex(index);
  }
  yield log('upload.js finish recognize error' + imageFile, 'ERROR');
  console.log('-----finish recognize error');
  process.exit(1);
}

function* getKuiRecord(index, kuiNumber) {
  const kuiList = yield searchKui(kuiNumber);
  if(kuiList.length == 0){
    yield updateIndex(index);
    yield log('upload.js finish kui not found kuiNumber: ' + kuiNumber + ' ' + imageFile, 'ERROR');
    console.log('-----finish kui not found');
    process.exit(3);
  }
  return kuiList[0];
}

function uploadImage(File, filePath) {
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  return File.create(fileName, fileContent);
}

function* registerKHMD(index, data, kuiNumber) {
  yield insertKuiHitMachineData(data);
  yield updateIndex(index);
  yield log('upload.js complete kuiNumber: ' + kuiNumber + ' ' + imageFile);
}

function* earthguide(File, filePath) {
  const imgfileMatches = imageFile.match(/.*IMG(\d+).*/);
  const index = parseInt( imgFileMatches[1] );
  if(isSkip == '1'){
    yield updateIndex(index);
    process.exit(5);
  }
  const result = yield all(filePath);
  console.log('--------');
  console.log(result[0] + ' ' + result[1] + ' ' + result[2] + ' ' + result[3]);
  console.log('--------');
  const matches = result[0].match(/(\d{3})-(\d{3})/);
  if(!matches){
    exitWithRecognizeError(index);
  }
  const kuiNumber = parseInt( matches[2] );

  // 杭データ確認
  const kuiObj = yield getKuiRecord(index, kuiNumber);

  // 画像アップロード
  const file = yield uploadImage(File, filePath);

  const dataType = getDataType(result);
  if (!Number.isInteger(dataType)) {
    yield updateIndex(index);
    console.log('-----finish ignore kui number');
    yield log('upload.js finish ignore status kuiNumber: ' + kuiNumber + ' ' + imageFile);
    process.exit(4);
  }
  // データ登録
  const kuiHMD = yield buildKuiHitmachineData(kuiObj.objectId, dataType, file.name);
  yield registerKHMD(index, kuiHMD, kuiNumber);
  console.log('-----complete');
  process.exit(0);
}

function* sanwa(File, filePath) {
  const filename = path.basename(filePath);
  const matches = filename.match(/^(\d+)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d+)_(\d+)\.[a-zA-Z]+$/);
  if (!matches) {
    exitWithRecognizeError(null);
  }
  const index = parseInt(matches[1]);
  const year = matches[2];
  const month = matches[3];
  const day = matches[4];
  const hour = matches[5];
  const minute = matches[6];
  const second = matches[7];
  const kuiNumber = parseInt(matches[8]);
  const dataType = parseInt(matches[9]);

  // 杭データ確認
  const kuiObj = yield getKuiRecord(index, kuiNumber);
  // 画像アップロード
  const file = yield uploadImage(File, filePath);
  const createDate = new Date(`${year}/${month}/${day} ${hour}:${minute}:${second}+0900`);

  const kuiHMD = yield buildKuiHitmachineData(kuiObj.objectId, dataType, file.name, createDate.valueOf()/1000);
  yield registerKHMD(index, kuiHMD, kuiNumber);
  console.log('-----complete');
  process.exit(0);
}

let ajax;
let log;

co(function*(){
  console.log('-----start');
  const filePath = __dirname + '/' + imageFile;

  // AppPot API呼び出し準備
  const authInfo = new AppPot.AuthInfo();
  const conf = new AppPot.Config(config, macAddr);
  ajax = new AppPot.Ajax(authInfo, conf);
  const authenticator = new AppPot.LocalAuthenticator(authInfo, conf, ajax);
  const File = AppPot.getFileClass(authInfo, conf, ajax);
  log = (msg, level) => {
    return new Promise( (resolve, reject)=>{
      ajax.post('logs')
        .send({
          message: '[tpredge]['+macAddr+'] ' + msg,
          logLevel: level || 'MONITOR'
        })
        .end(AppPot.Ajax.end(resolve, reject));
    });
  };

  // ログイン
  yield authenticator.login(account.username, account.password);

  yield log('upload.js logined ' + imageFile);

  const machineType = yield getMachineType(siteId);


  if (!machineType) {
    yield earthguide(File, filePath);
  } 

  switch (machineType) {
    case 'kuiHitMachineManager-0001': {
      yield earthguide(File, filePath);
      break;
    }
    case 'kuiHitMachineManager-0002': {
      yield sanwa(File, filePath);
      break;
    }
    default: {
      yield log(`upload.js unknown machine type ${machineType}`);
      process.exit(6);
    }
  }
})
.catch(error=>{
  console.log(error);
  if(error.results) {
    if(error.results.code == 'ENOTFOUND' && error.results.syscall == 'getaddrinfo'){
      process.exit(2);
    }
    if(error.results.code == 'ECONNABORTED' && error.results.errno == 'ETIME'){
      process.exit(2);
    }
  }
  console.log('-----finish unknown error');
  process.exit(255);
});
