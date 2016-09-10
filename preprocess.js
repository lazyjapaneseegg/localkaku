'use strict';
const path = require('path');
const fs = require('fs');

module.exports = (input, output, configuration) => {
//module.exports = (input = 'host/stage1.bin', output = 'host/payload.js') => {
  const ROP_PATH =  path.join(configuration.path, input);

  const buffer = fs.readFileSync(ROP_PATH);
  const fileSize = fs.statSync(ROP_PATH).size;

  const getASCIIfromBuffer = ({buffer, begin, end}) => {
    const outputArray = [];
    for(let i=begin; i<end; i++) {
      outputArray.push(String.fromCharCode(buffer.readUInt8(i)))
    }
    return outputArray.join('')
  }

  let
    headerSize = 0x40,
    dataSize = buffer.readUInt32LE(0x10),
    codeSize = buffer.readUInt32LE(0x20),
    relocationSize = buffer.readUInt32LE(0x30),
    symbolTableSize = buffer.readUInt32LE(0x38),
    relocationOffset = headerSize + dataSize + codeSize,
    symbolTable = relocationOffset + relocationSize,
    symbolTableEntriesCount = Math.floor(symbolTableSize / 8),
    relocationTypes = Object.create(null);

  for (let x = 0; x < symbolTableEntriesCount; x++) {
    let
      type = buffer.readUInt32LE(symbolTable + 8 * x),
		  typeDescriptionOffset = buffer.readUInt32LE(symbolTable + 8 * x + 4),
		  begin = typeDescriptionOffset,
		  end = typeDescriptionOffset;
  	while (buffer.readUInt8(end) != 0) end ++;
  	let name = getASCIIfromBuffer({buffer, begin, end});
  	relocationTypes[type] = name
  }

  const reloc_type_map = {
		"rop.data": 1,       // dest += rop_data_base
		"SceWebKit": 2,      // dest += SceWebKit_base
		"SceLibKernel": 3,   // dest += SceLibKernel_base
		"SceLibc": 4,        // dest += SceLibc_base
		"SceLibHttp": 5,     // dest += SceLibHttp_base
		"SceNet": 6,         // dest += SceNet_base
		"SceAppMgr": 7,      // dest += SceAppMgr_base
	},
  want_len = 0x40 + dataSize + codeSize,
  relocs = Array.from(Array(Math.floor(want_len / 4)), _ => 0);
  for (let x = 0, max = Math.floor(relocationSize / 8); x < max; x++){

    let reloc_type = buffer.readUInt16LE(relocationOffset + 8 * x),
		    type = buffer.readUInt16LE(relocationOffset + 8 * x + 2),
		    offset = buffer.readUInt32LE(relocationOffset + 8 * x + 4),
        wk_reloc_type = reloc_type_map[relocationTypes[type]]

        relocs[Math.floor(offset / 4)] = wk_reloc_type
  }

  let urop_js = [];
  for(let x=0; x < want_len; x+=4){
    urop_js.push(buffer.readUInt32LE(x))
  }

  const FILEOUT = path.join(configuration.path, output);

  if (path.extname(output) === '.js') {
    const content = `\npayload = [${urop_js.join(',')}];\nrelocs = [${relocs.join(',')}];`;
    fs.writeFileSync(FILEOUT, content);
  } else {
    let finalSizeInBytes = 4 + urop_js.length * 4 + relocs.length;
    if (finalSizeInBytes % 4) finalSizeInBytes += 4 - finalSizeInBytes % 4;
    const buf = Buffer.alloc(finalSizeInBytes);
    buf.writeUInt32LE(Math.floor(want_len / 4), 0);
    urop_js.forEach((word, i) => buf.writeUInt32LE(word, 4 + i * 4));
    relocs.forEach((reloc, i) => buf.writeUInt8(reloc, 4 + urop_js.length * 4 + i));
    fs.writeFileSync(FILEOUT, buf);
  }
}
