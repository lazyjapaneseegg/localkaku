const fs = require('fs');
const path = require('path');
const getParameters = url => {
  const result = {};
  const parameters = url.split('?')[1].split('&');
  parameters.forEach(parameter => {
    [name, value] = parameter.split('=');
    if (name) result[name] = Number('0x' + value);
  })
  return result;
}

this.onload = function (
  request,
  response,
  polpetta
) {
  const parameters = getParameters(request.url);

  const STAGE2_PATH = path.resolve(__dirname, '../stage2.bin');
  const buffer = fs.readFileSync(STAGE2_PATH);
  const u32Payload = [];
  const u8Payload = [];
  const fileSize = fs.statSync(STAGE2_PATH).size;

  for(let i=0, max=fileSize/4; i<max; i++) {
    const pos = i * 4;
    u32Payload.push(buffer.readUInt32LE(pos));
    u8Payload.push(buffer.readUInt8(pos), buffer.readUInt8(pos + 1));
    u8Payload.push(buffer.readUInt8(pos + 2), buffer.readUInt8(pos + 3));
  }

  const sizeWords = u32Payload[0];
  const dataSize = u32Payload[1 + 4]; // 16/4
  const codeSize = u32Payload[1 + 8]; // 32/4
  const codeBase = parameters.a1;
  const dataBase = parameters.a1 + codeSize;

  for (let i=0; i< sizeWords; ++i) {
    let add = 0;

  	let x = u8Payload[sizeWords * 4 + 4 + i - 1];
  	if (x == 1) {
  		add = dataBase;
  	} else if (x != 0) {
      let parameter = 'a' + x;
  		if (! parameter in parameters) throw new Error('broken reloc');
  		add = parameters['a' + x];
  	}

  	u32Payload[i] += add;
  }

  const dataStart = 1 + 0x40 / 4;
  const codeStart = 1 + (0x40 + dataSize) / 4;
  const data = [].slice.call(u32Payload, dataStart, dataStart + dataSize / 4);
  const code = [].slice.call(u32Payload, codeStart, codeStart + codeSize / 4);
  const responseArray = code.concat(data);
  const responseBuffer = new Buffer(responseArray.length * 4);
  responseArray.forEach((u32, i) => responseBuffer.writeUInt32LE(u32, i * 4));
  response.writeHead(200, {'Content-Type': 'application/octet-stream'});
  response.end(responseBuffer);

};
