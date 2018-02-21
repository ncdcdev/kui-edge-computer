const dbfile = process.argv[2];
const listFile = process.argv[3];
const fileNum = process.argv[4];

const FlashAirLib = require('flashair2');
const Indexes = require('./indexes-model')(dbfile);
const config = require('./config');
const ssid = config.wifiSsid;

function getFileList(path){
  return new Promise((resolve, reject)=>{
    let flashair;
    flashair = FlashAirLib('flashair.flash', 'AP');
    flashair.command.getFileList(path, (err, files)=>{
      if(err){
        reject(err);
      }else{
        resolve(files);
      }
    });
  });
}

console.log('start...');
getFileList('/VTIMG')
.then(files=>{
  return Promise.all(files.map(file=>{
    return getFileList('/VTIMG/' + file.name);
  }));
})
.then(results=>{
  let allFile = [];
  results.forEach(files=>{
    files.forEach(file=>{
      allFile.push({
        name: file.name,
        path: file.path
      });
    });
  });
  return allFile;
})
.then(allFile=>{
  Indexes.findById(ssid)
    .then(result=>{
      let index = -1;
      if(result){
        index = result.index;
      }

      console.log('index-no: ' + index);
      const targetFiles = allFile.filter(file=>{
        return parseInt(file.name.substring(3)) > index;
      }).sort((a, b)=>{
        return parseInt(a.name.substring(3)) - parseInt(b.name.substring(3));
      }).slice(0, fileNum||10);
      if( targetFiles.length == 0 ){
        console.log('finish file notfound...');
        process.exit(1);
      }
      require('fs').writeFileSync(listFile, targetFiles.map(file=>file.path).join('\n')+'\n');
      console.log('complete...');
      process.exit(0);
    });
})
.catch(e=>{
  console.log(e);
  console.log('finish unknown error...');
  process.exit(2);
});

