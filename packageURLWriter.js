const path = require('path');
const fs = require('fs');

module.exports = (input, url, configuration) => {

  const ROP_PATH =  path.join(configuration.path, input);
  const buffer = fs.readFileSync(ROP_PATH);
  const u8ROP = [];

  const fileSize = fs.statSync(ROP_PATH).size;
  // not the most efficient way... but I'm too lazy to change it for opening the file only once.
  for(let i=0, max=fileSize; i<max; i++) {
    u8ROP.push(buffer.readUInt8(i));
  }

  const needle = Array.from(Array(256), _ => 'x').join('');
  const indexFinder = (value, index, array) => {
    if (
      value === 0x78 &&
      array.slice(index, index + 256).map(
        x => String.fromCharCode(x)
      ).join('') === needle
    ) return true;
    return false;
  }

  const patch = Buffer.alloc(256);
  url.split('').forEach((char, index) => patch.writeUInt8(char.charCodeAt(0), index));

  const fd = fs.openSync(ROP_PATH, 'r+');
  fs.writeSync(fd, patch, 0, patch.length, u8ROP.findIndex(indexFinder));
}
