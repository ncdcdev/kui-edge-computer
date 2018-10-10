const co = require('co');
const config = require('./config');
const account = require('./account');
const AppPot = require('./apppot-sdk-lite');

const macAddr = process.argv[2];
const message = process.argv[3];


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

  // ログイン
  yield authenticator.login(account.username, account.password);

  yield log(message);
})
.catch(error=>{
  console.log(error);
  if(error.results) {
    if(error.results.code == 'ECONNABORTED' && error.results.errno == 'ETIME'){
      process.exit(2);
    }
  }
  process.exit(255);
});
