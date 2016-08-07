const fetch = require('node-fetch');
const fs = require('fs');
const http = require('http');
const https = require('https');
const mkdirp = require('mkdirp');
const mv = require('mv');
const os = require('os');
const path = require('path');
const extract = require('extract-zip')
const url = require('url');
const spawnSync = require('child_process').spawnSync;

const interfaces = os.networkInterfaces();
const CONFIGURATION_PATH = path.join(__dirname,  'configuration.json');
const EXPLOIT_PATH = path.join(__dirname, 'exploit');
const LATEST_ZIP_PATH = path.join(__dirname, 'latest.zip');

getCurrentIP = () => {
  let result;
  Object.keys(interfaces).forEach(function (name) {
    // assume the first valid address is correct.
    interfaces[name].some(function (interface) {
      if (interface.family !== 'IPv4' || interface.internal !== false) {
        return false;
      }
      result = interface.address;
      return true;
    });
  });
  return result;
}

getDirectories = sourcePath => {
  return fs.readdirSync(sourcePath).filter(function(file) {
    return fs.statSync(path.join(sourcePath, file)).isDirectory();
  });
}

downloadLatest = latestURL => {
  return new Promise((ok, ko) => {
    const file = fs.createWriteStream(LATEST_ZIP_PATH);
    file.on('finish', ok);

    const options = {
      host: url.parse(latestURL).host,
      path: url.parse(latestURL).pathname,
      method: 'GET',
      headers: {
      }
    };
    https.get(latestURL, res => res.pipe(file));
  });
}

getRealURLFromZipBallURI = url => {
  const tag = url.split('/zipball/')[1];
  return `https://codeload.github.com/henkaku/henkaku/zip/${tag}`
}

getLatestVersion = () => {
  return fetch(
    'https://api.github.com/repos/henkaku/henkaku/releases/latest'
  ).then(
    res => {
      return res.json().then(res => getRealURLFromZipBallURI(res.zipball_url))
    }
  )
}

fileExists = filePath => {
  let result;
  try {
    result = fs.statSync(filePath).isFile();
  } catch (e) {
    result = false;
  };
  return result;
}

const prepare = _ => {

  const folder = path.join(EXPLOIT_PATH, getDirectories(EXPLOIT_PATH)[0]);
  const configuration = Object.create(null);
  configuration.path = folder;
  fs.writeFileSync(CONFIGURATION_PATH, JSON.stringify(configuration));

  console.log('spawning build.sh...')
  spawnSync('sh', [path.join(folder, 'build.sh'),
    `http://${getCurrentIP()}:1337/stage2/`,
    `http://${getCurrentIP()}:1337/pkg`
  ], {
    stdio: 'inherit',
    cwd: folder
  });

  const redirect = path.join(folder, 'host', 'index.njs');
  fs.writeFileSync(redirect, `this.onload = function (
    request,
    response,
    polpetta
  ) {
    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end('<script>location.href="exploit.html"</script>'); }`);

  const STAGE2_PATH = path.join(folder, 'host', 'stage2');
  mkdirp.sync(STAGE2_PATH);
  fs.writeFileSync(
    path.join(STAGE2_PATH, 'index.njs'),
    fs.readFileSync(path.join(__dirname, 'index.njs'))
  );

  runPolpetta();
}

const unzipAndPrepare = _ => {
  mkdirp.sync(EXPLOIT_PATH);
    extract(LATEST_ZIP_PATH, {dir: EXPLOIT_PATH}, err => {
      if (err) {
        console.log('Error during unzip:', err);
      } else {
        prepare();
      }
    });
}

const main = _ => {
  if(!fileExists(CONFIGURATION_PATH)) {
    console.log('installing the exploit');
    getLatestVersion().then(url => {
      console.log(`downloading ${url}`);
      downloadLatest(url).then(unzipAndPrepare);
    })
  } else {
    runPolpetta();
  }
}

const runPolpetta = _ => {
  const exploitPath = require('./configuration.json').path;
  const ip = getCurrentIP();
  console.log(`
    Navigate your PSVita to
    ================================
    >>>>>> ${ip}:1337
    ================================
  `);
  const p = spawnSync('./node_modules/.bin/polpetta', [
    path.join(exploitPath, 'host'),
    '0.0.0.0:1337'
  ], {
    stdio: 'inherit'
  })
  console.log(p);
};

main();
