const FlashAirLib = require('flashair2');
const Indexes = require('./indexes-model')(process.argv[2]);

function getFileList(path){
  return new Promise((resolve, reject)=>{
    let flashair;
    try{
      flashair = FlashAirLib('flashair.flash', 'AP');
      flashair.command.getFileList(path, (err, files)=>{
        if(err){
          reject(err);
        }else{
          resolve(files);
        }
      });
    }catch(e){
      reject(e);
    }
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
  Indexes.findById(process.argv[3])
    .then(result=>{
      let index = 0;
      if(result){
        index = result.index;
      }

      const targetFiles = allFile.filter(file=>{
        return parseInt(file.name.substring(3)) > index;
      }).sort((a, b)=>{
        return parseInt(a.name.substring(3)) - parseInt(b.name.substring(3));
      }).slice(0, process.argv[5]||10);
      if( targetFiles.length == 0 ){
        console.log('finish 1...');
        process.exit(1);
      }
      require('fs').writeFileSync(process.argv[4], targetFiles.map(file=>file.path).join('\n')+'\n');
      console.log('complete...');
      process.exit(0);
    });
})
.catch(e=>{
  console.log(e);
  console.log('finish 2...');
  process.exit(2);
});

