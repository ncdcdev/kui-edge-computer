const configJson = require('./config');
const superagent = require('superagent');

class Config {
  constructor(configJson, udid){
    this._options = Object.assign({}, configJson);
    this._options['deviceUDID'] = udid;
  }
  get entryPoint(){
    return this._options.url + 'api/'
      + this._options.companyId + '/'
      + this._options.appId + '/'
      + this._options.appVersion + '/';
  }
  get appId(){
    return this._options.appId;
  }
  get appKey(){
    return this._options.appKey;
  }
  get appVersion(){
    return this._options.appVersion;
  }
  get companyId(){
    return this._options.companyId;
  }
  get deviceUDID(){
    return this._options.deviceUDID;
  }
}

class AuthInfo {
  constructor(){
    this.clearToken();
  }
  clearToken(){
    this._token = '';
  }
  hasToken(){
    return this._token !== '';
  }
  getToken(){
    return this._token;
  }
  setToken(token){
    this._token = token;
  }
}

class Ajax {
  constructor(authInfo, config){
    this._config = config;
    this._authInfo = authInfo;
  }

  buildOptions(options){
    return Object.assign({
      entryPoint: this._config.entryPoint,
      contentType: 'application/json',
      timeout: 60000
    }, options);
  }

  setToken(agent){
    if(this._authInfo.hasToken()){
      return agent.set('apppot-token', this._authInfo.getToken());
    }
    return agent;
  }

  get(url, options){
    const opts = this.buildOptions(options);
    const agent = superagent
      .get(opts.entryPoint + url)
      .timeout(opts.timeout);
    return this.setToken(agent);
  }

  post(url, options){
    const opts = this.buildOptions(options);
    const agent = superagent
      .post(opts.entryPoint + url)
      .timeout(opts.timeout);
    if(opts.contentType && opts.contentType != 'no-set'){
      agent.set('Content-Type', opts.contentType);
    }
    return this.setToken(agent);
  }
  static end(resolve, reject){
    return (err, res)=>{
      if(err){
        const obj = {
          'status': 'error',
          'results': err,
          'response': res
        }
        reject(obj);
      }else{
        if(res.type.match('octet-stream')){
          resolve(res.text);
          return;
        }
        const obj = JSON.parse(res.text);
        if(obj.hasOwnProperty('status') && obj['status'] == 'error'){
          reject({errorCode: obj.errorCode, description: obj.description});
        }else{
          resolve(obj);
        }
      }
    }
  }
}

class LocalAuthenticator {
  constructor(authInfo, config, ajax){
    this._config = config;
    this._ajax = ajax;
    this._authInfo = authInfo;
    this.isLogined = false;
  }
  login(user, pass){
    return this.getAnonymousToken()
      .then(()=>{
        return this.apiLogin(user, pass);
      });
  }
  getAnonymousToken(){
    return new Promise((resolve, reject)=>{
      this._ajax.get('anonymousTokens')
        .query(`appKey=${this._config.appKey}`)
        .query(`deviceUDID=${this._config.deviceUDID}`)
        .end(Ajax.end((obj)=>{
          this._authInfo.setToken(obj.results);
          resolve(obj.results);
        }), reject);
    });
  }
  apiLogin(user, pass){
    return new Promise((resolve, reject)=>{
    this._ajax.post('auth/login')
      .send({
        username: user,
        password: pass,
        appId: this._config.appId,
        deviceUDID: this._config.deviceUDID,
        isPush: false,
        appVersion: this._config.appVersion,
        companyId: this._config.companyId
      })
      .end(Ajax.end((obj)=>{
          this.isLogined = true;
          if(obj.authInfor){
            obj.authInfo = obj.authInfor;
            delete obj.authInfor;
          }
          this._authInfo.setToken(obj.authInfo.userTokens);
          resolve(this._authInfo);
        }, (obj)=>{
          this.isLogined = false;
        })
      )
    });
  }
}

function getFileClass(authInfo, config, ajax){
  return class File {
    constructor(name, url){
      this._name = name;
      this._url = url;
    }
    static getUrl(filename){
      return `${config.entryPoint}files/${filename}?userToken=${authInfo.getToken()}`;
    }
    get url(){
      return `${config.entryPoint}files/${this.name}?userToken=${authInfo.getToken()}`;
    }
    get name(){
      return this._name;
    }
    static create(filename, content, progress){
      const prog = progress ? progress : ()=>{};
      const entity = JSON.stringify({name: filename});
      return new Promise((resolve, reject)=>{
        ajax.post('files', {
          'contentType': 'no-set'
        })
        .field('entity', entity)
        .attach('file', content)
        .on('progress', prog)
        .end(Ajax.end((res)=>{
          let file = new File(res.results.name, res.results.url);
          resolve(file);
        }, reject))
      });
    }
    get(progress){
      return File.get(this.name, progress);
    }
    static get(filename, progress){
      const prog = progress ? progress : ()=>{};
      return new Promise((resolve, reject)=>{
        ajax.get(`files/${filename}`)
        .query(`userToken=${authInfo.getToken()}`)
        .on('progress', prog)
        .end(Ajax.end((res)=>{
          resolve(res);
        }, reject))
      });
    }
    update(filename, content, progress){
      const prog = progress ? progress : ()=>{};
      const entity = JSON.stringify({name: filename});
      return new Promise((resolve, reject)=>{
        ajax.put(`files/${this.name}`, {
          'contentType': 'no-set'
        })
        .field('entity', entity)
        .attach('file', content)
        .on('progress', prog)
        .end(Ajax.end((res)=>{
          let file = new File(res.results.name, res.results.url);
          resolve(file);
        }, reject))
      });
    }
    remove(filename){
      return new Promise((resolve, reject)=>{
        ajax.remove(`files/${this.name}`)
        .end(Ajax.end((res)=>{
          resolve(res);
        }, reject))
      });
    }
  }
}


module.exports = {
  Config,
  AuthInfo,
  Ajax,
  LocalAuthenticator,
  getFileClass
};
