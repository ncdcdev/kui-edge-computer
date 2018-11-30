const indexFile = process.argv[2];
const listFile = process.argv[3];
const fileNum = process.argv[4];
const isSkip = process.argv[5];
const machineTypeFile = process.argv[6];

const FlashAirLib = require('flashair2');
const fs = require('fs');

const machineType = fs.readFileSync(machineTypeFile, {
  encoding: 'utf8'
});

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

// function getFilesRecursive(path, result = []) {
//   let flashair;
//   flashair = FlashAirLib('flashair.flash', 'AP');
//   flashair.command.getFileList(path, (err, files)=>{
//     if(err){
//       throw new Error('failed list flashair files');
//     }else{
//       files.map((file) => {
//         if (file.directory) {
//           result = getFilesRecursive(`${path}/${file.name}`, result);
//         } else {
//           result.push({
//             name: file.name,
//             path: file.path
//           });
//         }
//       });
//     }
//   });
//   return result;
// }

function earthguide() {
  console.log('start...');
  const rootDir = '/VTIMG';
  getFileList(rootDir)
  .then(files=>{
    return Promise.all(files.map(file=>{
      return getFileList(`${rootDir}/${file.name}`);
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
    if(isSkip == '0'){
      fs.readFile(indexFile, (err, _index) => {
          let index = -1;
          if(!err){
            index = _index;
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
          fs.writeFileSync(listFile, targetFiles.map(file=>file.path).join('\n')+'\n');
          console.log('complete...');
          process.exit(0);
        });
    }else{
      const allFileNum = allFile.length;
      if (allFileNum == 0) {
        fs.writeFileSync(indexFile, "-1");
        process.exit(3);
      }else{
        const lastFile = allFile[allFileNum - 1];
        const newIndex = parseInt(lastFile.name.substring(3));
        fs.writeFileSync(indexFile, newIndex);
        fs.writeFileSync(listFile, lastFile.path + '\n');
        process.exit(2);
      }
    }
  })
  .catch(e=>{
    console.log(e);
    console.log('finish unknown error...');
    process.exit(255);
  });
}

function sanwa() {
  console.log('start...');
  const rootDir = '/CAPT';
  getFileList(rootDir)
  .then(files=>{
    let allFile = [];
    files.map(file=>{
      allFile.push({
        name: file.name,
        path: file.path
      });
    });
    return allFile;
  })
  .then(allFile=>{
    if(isSkip == '0'){
      fs.readFile(indexFile, (err, _index) => {
          let index = -1;
          if(!err){
            index = _index;
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
          fs.writeFileSync(listFile, targetFiles.map(file=>file.path).join('\n')+'\n');
          console.log('complete...');
          process.exit(0);
        });
    }else{
      const allFileNum = allFile.length;
      if (allFileNum == 0) {
        fs.writeFileSync(indexFile, "-1");
        process.exit(3);
      }else{
        const lastFile = allFile[allFileNum - 1];
        const newIndex = parseInt(lastFile.name.substring(3));
        fs.writeFileSync(indexFile, newIndex);
        fs.writeFileSync(listFile, lastFile.path + '\n');
        process.exit(2);
      }
    }
  })
  .catch(e=>{
    console.log(e);
    console.log('finish unknown error...');
    process.exit(255);
  });
}

switch(machineType) {
  case 'kuiHitMachineManager-0001': {
    earthguide();
    break;
  }
  case 'kuiHitMachineManager-0002': {
    sanwa();
    break;
  }
  default: {
    process.exit(4);
  }
}



