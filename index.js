const argv = (
  require('yargs')
    .command('--use-python-build', 'Use embedded build.sh shell script that invokes python to patch the rop, use this if newer version breaks (usually not needed).')
    .command('--reinstall', 'Use this to fetch and reinstall the latest version of henkaku')
    .command('--list-release', 'List all the releases')
    .command('--tag tag', 'download a specific release (tag)')
    .command('--port port', 'use a specific port instead of 1337')
    .command('--address address', 'use a specific url to patch henkaku rops')
    .help().argv
);

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
const rimraf = require('rimraf');

const interfaces = os.networkInterfaces();
const CONFIGURATION_PATH = path.join(__dirname,  'configuration.json');
const EXPLOIT_PATH = path.join(__dirname, 'exploit');
const LATEST_ZIP_PATH = path.join(__dirname, 'latest.zip');

const preprocess = require('./preprocess');
const writeURL = require('./packageURLWriter');

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

getLatestOrTaggedVersion = () => {
  if (argv.tag) {
    return Promise.resolve(getRealURLFromZipBallURI('/zipball/' + argv.tag));
  }
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
const patch = configuration => {
  console.log('building the exploit...');
  const folder = configuration.path;
  fs.writeFileSync(
    path.join(folder, 'host/stage1.bin'),
    fs.readFileSync(path.join(folder, 'loader.rop.bin'))
  );
  const IP = getCurrentIP();
  const PORT = argv.port || 1337;
  const ADDRESS = argv.address || `http://${IP}:${PORT}`;

  preprocess('exploit.rop.bin', 'host/stage2.bin', configuration);
  writeURL('host/stage1.bin', `${ADDRESS}/stage2/`, configuration);
  writeURL('host/stage2.bin', `${ADDRESS}/pkg`, configuration);
  preprocess('host/stage1.bin', 'host/payload.js', configuration);
  console.log('built!');
}
const prepare = _ => {

  const folder = path.join(EXPLOIT_PATH, getDirectories(EXPLOIT_PATH)[0]);
  const configuration = Object.create(null);
  configuration.path = folder;
  fs.writeFileSync(CONFIGURATION_PATH, JSON.stringify(configuration));
  if (argv.usePythonBuild) {
    console.log('spawning build.sh...')
    const IP = getCurrentIP();
    const PORT = argv.port || 1337;
    const ADDRESS = argv.address || `http://${IP}:${PORT}`;
    spawnSync('sh', [path.join(folder, 'build.sh'),
      `http://${ADDRESS}/stage2/`,
      `http://${ADDRESS}/pkg`
    ], {
      stdio: 'inherit',
      cwd: folder
    });
  } else {
    patch(configuration);
  }

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
    fs.readFileSync(path.join(__dirname, 'assets', 'index.njs'))
  );

  // fixes vitashell broken installation
  fs.writeFileSync(
    path.join(folder, 'host', '.htaccess'),
    fs.readFileSync(path.join(__dirname, 'assets', '.htaccess'))
  );

  runPolpetta();
}

const unzipAndPrepare = _ => {
  try {
    rimraf.sync(EXPLOIT_PATH);
  } catch (e) {
    //ignore...
  }
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
  if (argv.listRelease) {
    fetch('https://api.github.com/repos/henkaku/henkaku/tags').then(
      res => res.json().then(
        tags => Promise.all(
          tags.map(
            tag => new Promise(
              (ok, ko) => fetch(`https://api.github.com/repos/henkaku/henkaku/releases/tags/${tag.name}`).then(
                res => res.json().then(releases => ok(releases))
              )
            )
          )
        )
      ).then(releases => {
        releases.forEach(release => {
          console.log('====================\n');
          console.log(`Version ${release.tag_name} (${release.published_at.substring(0,10)}):\n${release.body}`);
          console.log('====================\n');
        })

      })
    );
  } else {
    if (!fileExists(CONFIGURATION_PATH) || argv.reinstall) {
      console.log('installing the exploit');
      getLatestOrTaggedVersion().then(url => {
        console.log(`downloading ${url}`);
        downloadLatest(url).then(unzipAndPrepare);
      })
    } else {
      patch(require(CONFIGURATION_PATH));
      runPolpetta();
    }
  }
}

const runPolpetta = _ => {
  const exploitPath = require('./configuration.json').path;
  const ip = getCurrentIP();
  const port = argv.port || 1337
  console.log(`
    Navigate your PSVita to
    ================================
    >>>>>> ${ip}:${port}
    ================================
  `);
  const p = spawnSync('./node_modules/.bin/polpetta', [
    path.join(exploitPath, 'host'),
    `0.0.0.0:${port}`
  ], {
    stdio: 'inherit'
  })
  console.log(p);
};

main();
