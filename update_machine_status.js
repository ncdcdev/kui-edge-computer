const fs = require('fs');
const co = require('co');
const AppPot = require('./apppot-sdk-lite');
const config = require('./config');

const indexFile = process.argv[2];
const macAddr = process.argv[3];
const siteIdFile = process.argv[4];

/** exit code
 * exit 0 => normal
 * exit 1 => require reboot
 * exit 5 => unknown error
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
          message: msg,
          logLevel: level || 'MONITOR'
        })
        .end(AppPot.Ajax.end(resolve, reject));
    });
  };

  yield authenticator.login(config.account, config.password);
  yield log('update_machine_status.js logined ' + imageFile);

  const machine = yield getMachine(ajax);

  const siteId = fs.readFileSync(siteIdFile);

  if(machine.status == 'rebooting'){
    yield log('rebooting...');
    process.exit(1);
  }

  if(siteId != machine.siteId){
    fs.writeFileSync(siteIdFile, machine.siteId);
    yield log('overrided siteId to: ' + machine.siteId);
  }

  if(machine.overrideIndex) {
    fs.writeFileSync(indexFile, machine.index);
    yield log('overrided index to: ' + machine.index);
  }

  machie.status = 'normal';
  ajax.post('data/batch/updateData')
    .send({
      objectName: 'Machine',
      data: [
        machine
      ]
    })
    .end(()=>{}, ()=>{});
})
.catch(error=>{
  console.log(error);
  console.log('-----finish unknown error');
  process.exit(5);
});