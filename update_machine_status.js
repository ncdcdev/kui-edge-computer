const fs = require('fs');
const co = require('co');
const AppPot = require('./apppot-sdk-lite');
const config = require('./config');
const account = require('./account');

const indexFile = process.argv[2];
const macAddr = process.argv[3];
const siteIdFile = process.argv[4];
const ssidFile = process.argv[5];
const pswdFile = process.argv[6];
const gittagFile = process.argv[7];
const machineTypeFile = process.argv[8];
const methodFile = process.argv[9];

/** exit code
 * exit 0 => normal
 * exit 1 => require reboot
 * exit 2 => require waiting
 * exit 3 => require halt
 * exit 4 => require update wlan settings
 * exit 5 => require update all codes using git
 * exit 6 => require skip existing files in flashari
 * exit 7 => require reconnect 3G network
 * exit 255 => unknown error
**/

function getMachine(ajax){
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
        resolve(obj.Machine[0]);
      }, (err) => {
        reject(err);
      }));
  });
}

function updateMachineStatus(ajax, machine) {
  return new Promise((resolve, reject) => {
    ajax.post('data/batch/updateData')
      .send({
        objectName: 'Machine',
        data: [{
          objectId: machine.objectId,
          serverUpdateTime: machine.serverUpdateTime,
          status: machine.status,
          overrideIndex: machine.overrideIndex,
          updateTime: Math.floor(Date.now() / 1000),
          pingDate: Date.now()
        }]
      })
      .end(AppPot.Ajax.end(resolve, reject));
  });
}

function getTypeAndMethod(ajax, siteId) {
  const searchMachineQuery = {
    'from': {
      'phyName' :'SiteMethod',
      'alias' :'SiteMethod'
    },
    'join': [{
      'entity': 'Method',
      'entityAlias': 'Method',
      'expression': {
        'source': '#SiteMethod.methodId = #Method.objectId'
      },
      'type': 'LEFT OUTER JOIN'
    }],
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
          resolve({
            machineType: obj.SiteMethod[0].kuiHitMachineManagerId,
            method: obj.Method[0].objectId 
          });
        }, (err)=>{
          reject(err);
        })
      );
  });
}

co(function*(){
  // AppPot API呼び出し準備
  const authInfo = new AppPot.AuthInfo();
  const conf = new AppPot.Config(config, macAddr);
  const ajax = new AppPot.Ajax(authInfo, conf);
  const authenticator = new AppPot.LocalAuthenticator(authInfo, conf, ajax);
  const log = (msg, level) => {
    return new Promise( (resolve, reject)=>{
      ajax.post('logs')
        .send({
          message: '[tpredge]['+macAddr+'] ' + msg,
          logLevel: level || 'MONITOR'
        })
        .end(AppPot.Ajax.end(resolve, reject));
    });
  };

  yield authenticator.login(account.username, account.password);

  let machine = yield getMachine(ajax);
  let doUpdate = false;
  let updatedWlan = false;
  // ハートビート代わりに、pingDateを更新する
  yield updateMachineStatus(ajax, machine);
  yield log('ping');
  machine = yield getMachine(ajax);

  const siteId = fs.readFileSync(siteIdFile, {
    encoding: 'utf8'
  });

  const machineType = fs.readFileSync(machineTypeFile, {
    encoding: 'utf8'
  });

  const method = fs.readFileSync(methodFile, {
    encoding: 'utf8'
  });

  const ssid = fs.readFileSync(ssidFile, {
    encoding: 'utf8'
  });

  const pswd = fs.readFileSync(pswdFile, {
    encoding: 'utf8'
  });

  const gittag = fs.readFileSync(gittagFile, {
    encoding: 'utf8'
  });

  if(machine.status == 'reboot'){
    yield log('rebooting...');
    machine.status = 'rebooting';
    yield updateMachineStatus(ajax, machine);
    process.exit(1);
  }else if(machine.status == 'waiting' || machine.status == 'halted'){
    yield log('waiting...');
    if(machine.status == 'halted'){
      machine.status = 'waiting';
      yield updateMachineStatus(ajax, machine);
    }
    process.exit(2);
  }else if(machine.status == 'halt'){
    yield log('halting...');
    machine.status = 'halted';
    yield updateMachineStatus(ajax, machine);
    process.exit(3);
  }else if(machine.status == 'sim-to-soracom'){
    machine.status = 'halted';
    yield updateMachineStatus(ajax, machine);
    process.exit(8);
  }else if(machine.status == 'sim-to-marubeni'){
    machine.status = 'halted';
    yield updateMachineStatus(ajax, machine);
    process.exit(9);
  }else if(machine.status != 'normal'){
    machine.status = 'normal';
    doUpdate = true;
  }

  if(machine.version != gittag){
    fs.writeFileSync(gittagFile, machine.version);
    yield log('update version to: ' + machine.version);
    process.exit(5);
  }

  if(siteId != machine.siteId){
    fs.writeFileSync(siteIdFile, machine.siteId);
    yield log('overrided siteId to: ' + machine.siteId);
  }

  let {
    machineType: newMachineType,
    method: newMethod
  } = yield getTypeAndMethod(ajax, machine.siteId);
  if (!newMachineType) {
    yield log('machineType not registered');
    newMachineType = 'kuiHitMachineManager-0001';
  }
  if(machineType != newMachineType) {
    fs.writeFileSync(machineTypeFile, newMachineType);
    yield log('overrided machineType to: ' + newMachineType);
  }
  if(method != newMethod) {
    fs.writeFileSync(methodFile, newMethod);
    yield log('overrided method to: ' + newMethod);
  }
  
  if(machine.overrideIndex == '0') {
    const currentIndex = fs.readFileSync(siteIdFile, {
      encoding: 'utf8'
    });
    machine.index = currentIndex;
    doUpdate = true;
  }else if(machine.overrideIndex == '1') {
    fs.writeFileSync(indexFile, machine.index);
    yield log('overrided index to: ' + machine.index);
    machine.overrideIndex = '0';
    doUpdate = true;
  }else if(machine.overrideIndex == '2') {
    fs.writeFileSync(indexFile, -1);
    yield log('overrided index and skip existing files');
    machine.overrideIndex = '0';
    yield updateMachineStatus(ajax, machine);
    process.exit(6);
  }

  if(doUpdate){
    yield updateMachineStatus(ajax, machine);
  }

  if(machine.wlanSsid != ssid){
    fs.writeFileSync(ssidFile, machine.wlanSsid);
    yield log('overrided wlanSsid to: ' + machine.wlanSsid);
    updatedWlan = true;
  }

  if(machine.wlanPassword != pswd){
    fs.writeFileSync(pswdFile, machine.wlanPassword);
    yield log('overrided wlanPW to: ' + machine.wlanPassword);
    updatedWlan = true;
  }

  if(updatedWlan){
    process.exit(4);
  }

})
.catch(error=>{
  console.log(error);
  if(error.results.code == 'ENOTFOUND' && error.results.syscall == 'getaddrinfo'){
    process.exit(7);
  }
  console.log('-----finish unknown error');
  process.exit(255);
});
