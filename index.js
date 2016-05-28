const SerialPort = require(`serialport`);

const x_min = -27000;
const y_min = -13500;
const z_max = 62500;

SerialPort.list((err, ports) => {
  let comName = undefined;
  for(let i = 0; i < ports.length; i++) {
    if (
      ports[i].vendorId === '0x23c1'
      &&
      ports[i].productId === '0xb017'
    ) {
      comName = ports[i].comName;
    }
  }
  var port = new SerialPort.SerialPort(comName, {
    baudrate: 115200
  });

  const commandQueue = [];
  port.on('open', function () {
    // Open the port
    commandQueue.push(init());

    // Home X and Y
    commandQueue.push(homeAxesMax(['x', 'y'], 300, 10));

    // Home Z
    commandQueue.push(homeAxesMin(['z'], 100, 10));
    commandQueue.push(queueExtendedPoint(x_min / 2, y_min / 2, 10000, 0, 0, 2000000, ['x', 'y', 'z', 'a', 'b']));

    // Send the gantry around in X and Y
    for(let i = 0; i < 2; i++) {
      commandQueue.push(queueExtendedPoint(0, 886, 0, 0, 0, 333333, ['x', 'y', 'z', 'a', 'b']));
      commandQueue.push(setRgbLed(255, 0, 0, 0));
      commandQueue.push(queueExtendedPoint(-886, 0, 0, 0, 0, 333333, ['x', 'y', 'z', 'a', 'b']));
      commandQueue.push(setRgbLed(0, 255, 0, 0));
      commandQueue.push(queueExtendedPoint(0, -886, 0, 0, 0, 333333, ['x', 'y', 'z', 'a', 'b']));
      commandQueue.push(setRgbLed(0, 0, 255, 0));
      commandQueue.push(queueExtendedPoint(886, 0, 0, 0, 0, 333333, ['x', 'y', 'z', 'a', 'b']));
      commandQueue.push(setRgbLed(127, 127, 0, 0));
    }

    // Turn off the motors
    commandQueue.push(enableDisableAxes(['x', 'y', 'z', 'a', 'b'], false));

    // Kick off the first command in the queue
    port.write(commandQueue.shift());
  });

  port.on('data', function (data) {
    // Need to parse the data in a more intelligent way
    // Should see d5, then listen for a length, then listen for the packets, then verify crc

    // console.log(data.toString('hex'));
    if (commandQueue.length > 0) {
      const command = commandQueue.shift();
      port.write(command);
    }
  });
});

function axesArrayToBitfield(axesArray) {
  // set all axes to lower case
  axesArray = axesArray.map((axis) => {
    return axis.toLowerCase();
  });

  let bitfield = 0b00000000;
  if (axesArray.includes('x')) {
    bitfield = bitfield | 0b00000001;
  }
  if (axesArray.includes('y')) {
    bitfield = bitfield | 0b00000010;
  }
  if (axesArray.includes('z')) {
    bitfield = bitfield | 0b00000100;
  }
  if (axesArray.includes('a')) {
    bitfield = bitfield | 0b00001000;
  }
  if (axesArray.includes('b')) {
    bitfield = bitfield | 0b00010000;
  }
  return bitfield;
}

function getVersion() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x00;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function init() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x01;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function availableBufferSize() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x02;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function clearBuffer() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x03;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function abort() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x07;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function pause() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x08;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function toolQuery(toolIndex, toolQuery) {
  const buffer = new Buffer(5 + toolQuery.length);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x0a;

  // Tool Index
  buffer[3] = toolIndex;

  for(let i = 0; i < toolQuery.length; i++) {
    buffer[i + 4] = toolQuery[i];
  }

  buffer[4 + toolQuery.length] = makeCRC(buffer);
  return buffer;
}

function isFinished() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x0b;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function readFromEeprom(offset, nBytes) {
  const buffer = new Buffer(7);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x0c;

  // EEPROM memory offset
  buffer[3] = offset & 0xff00;
  buffer[4] = offset & 0x00ff;
  
  // Number of bytes to read, N
  buffer[5] = nBytes;

  buffer[6] = makeCRC(buffer);
  return buffer;
}

function writeToEeprom(offset, nBytes, data) {
  const buffer = new Buffer(7 + data.length);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x0c;

  // EEPROM memory offset
  buffer[3] = offset & 0xff00;
  buffer[4] = offset & 0x00ff;
  
  // Number of bytes to read, N
  buffer[5] = nBytes;

  // Data to write to EEPROM
  for (let i = 0; i < data.length; i++) {
    buffer[6 + i] = data[i];
  }

  buffer[6 + data.length] = makeCRC(buffer);
  return buffer;
}

function reset() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x11;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function getCurrentPosition() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x15;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function getMotherboardStatus() {
  const buffer = new Buffer(4);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x17;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

function homeAxesMin(axes, feedrate, timeout) {
  const buffer = new Buffer(11);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x08;

  // Command Type
  buffer[2] = 0x83;

  // Axes mask
  buffer[3] = axesArrayToBitfield(axes);

  // Feedrate
  buffer[4]  = (0x000000ff & feedrate) >>  0;
  buffer[5]  = (0x0000ff00 & feedrate) >>  8;
  buffer[6]  = (0x00ff0000 & feedrate) >> 16;
  buffer[7]  = (0xff000000 & feedrate) >> 24;

  // Timeout
  buffer[8] = (0x000000ff & timeout) >> 0;
  buffer[9] = (0x0000ff00 & timeout) >> 8;
  buffer[10] = makeCRC(buffer);
  return buffer;
}

function homeAxesMax(axes, feedrate, timeout) {
  const buffer = new Buffer(11);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x08;

  // Command Type
  buffer[2] = 0x84;

  // Axes mask
  buffer[3] = axesArrayToBitfield(axes);

  // Feedrate
  buffer[4]  = (0x000000ff & feedrate) >>  0;
  buffer[5]  = (0x0000ff00 & feedrate) >>  8;
  buffer[6]  = (0x00ff0000 & feedrate) >> 16;
  buffer[7]  = (0xff000000 & feedrate) >> 24;

  // Timeout
  buffer[8] = (0x000000ff & timeout) >> 0;
  buffer[9] = (0x0000ff00 & timeout) >> 8;
  buffer[10] = makeCRC(buffer);
  return buffer;
}

function delay(time) {
  const buffer = new Buffer(8);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x05;

  // Command Type
  buffer[2] = 0x15;

  buffer[3] = time & 0x000000ff;
  buffer[4] = time & 0x0000ff00;
  buffer[5] = time & 0x00ff0000;
  buffer[6] = time & 0xff000000;

  buffer[7] = makeCRC(buffer);
  return buffer;
}

function changeTool(toolId) {
  const buffer = new Buffer(5);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x02;

  // Command Type
  buffer[2] = 0x86;

  // Tool ID of the tool to switch to
  buffer[3] = toolId & 0xff;

  buffer[4] = makeCRC(buffer);
  return buffer;
}

function waitForToolReady(toolId, queryDelay, timeout) {
  const buffer = new Buffer(9);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x06;

  // Command Type
  buffer[2] = 0x17;

  // Tool ID of the tool to wait for
  buffer[3] = toolId & 0xff;

  // Delay between query packets sent to the tool, in ms (nominally 100 ms)
  buffer[4] = queryDelay & 0x00ff;
  buffer[5] = queryDelay & 0xff00;

  // Timeout before continuing without tool ready, in seconds (nominally 1 minute)
  buffer[6] = timeout & 0x00ff;
  buffer[7] = timeout & 0xff00;

  buffer[8] = makeCRC(buffer);
  return buffer;
}

function toolAction(toolId, actionCommand, payload) {
  const buffer = new Buffer(7 + payload.length);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x01;

  // Command Type
  buffer[2] = 0x17;

  buffer[3] = makeCRC(buffer);
  return buffer;
}

// Pass an array of axes ['X', 'Y', 'Z', 'A', 'B']
// Pass boolean of enable / disable
function enableDisableAxes(axes, enable) {
  const buffer = new Buffer(5);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x02;

  // Command Type
  buffer[2] = 0x89;

  // Axes mask
  buffer[3] = axesArrayToBitfield(axes);

  buffer[4] = makeCRC(buffer);
  return buffer;
}

function queueExtendedPointOld(x, y, z, a, b, feedrate) {
  const buffer = new Buffer(28);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x19;

  // Command Type
  buffer[2] = 0x8b;
  
  // X coordinate, in steps
  buffer[3]  = 0x000000ff & x;
  buffer[4]  = 0x0000ff00 & x;
  buffer[5]  = 0x00ff0000 & x;
  buffer[6]  = 0xff000000 & x;

  // Y coordinate, in steps
  buffer[7]  = 0x000000ff & y;
  buffer[8]  = 0x0000ff00 & y;
  buffer[9]  = 0x00ff0000 & y;
  buffer[10] = 0xff000000 & y;

  // Z coordinate, in steps
  buffer[11] = 0x000000ff & z;
  buffer[12] = 0x0000ff00 & z;
  buffer[13] = 0x00ff0000 & z;
  buffer[14] = 0xff000000 & z;

  // A coordinate, in steps
  buffer[15] = 0x000000ff & a;
  buffer[16] = 0x0000ff00 & a;
  buffer[17] = 0x00ff0000 & a;
  buffer[18] = 0xff000000 & a;

  // B coordinate, in steps
  buffer[19] = 0x000000ff & b;
  buffer[20] = 0x0000ff00 & b;
  buffer[21] = 0x00ff0000 & b;
  buffer[22] = 0xff000000 & b;

  // Feedrate, in microseconds between steps on the max delta. (DDA)
  buffer[23] = 0x000000ff & feedrate;
  buffer[24] = 0x0000ff00 & feedrate;
  buffer[25] = 0x00ff0000 & feedrate;
  buffer[26] = 0xff000000 & feedrate;

  buffer[27] = makeCRC(buffer);
  return buffer;
}

function setExtendedPosition(x, y, z, a, b) {
  const buffer = new Buffer(24);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x15;

  // Command Type
  buffer[2] = 0x8c;
  
  // X coordinate, in steps
  buffer[3]  = 0x000000ff & x;
  buffer[4]  = 0x0000ff00 & x;
  buffer[5]  = 0x00ff0000 & x;
  buffer[6]  = 0xff000000 & x;

  // Y coordinate, in steps
  buffer[7]  = 0x000000ff & y;
  buffer[8]  = 0x0000ff00 & y;
  buffer[9]  = 0x00ff0000 & y;
  buffer[10] = 0xff000000 & y;

  // Z coordinate, in steps
  buffer[11] = 0x000000ff & z;
  buffer[12] = 0x0000ff00 & z;
  buffer[13] = 0x00ff0000 & z;
  buffer[14] = 0xff000000 & z;

  // A coordinate, in steps
  buffer[15] = 0x000000ff & a;
  buffer[16] = 0x0000ff00 & a;
  buffer[17] = 0x00ff0000 & a;
  buffer[18] = 0xff000000 & a;

  // B coordinate, in steps
  buffer[19] = 0x000000ff & b;
  buffer[20] = 0x0000ff00 & b;
  buffer[21] = 0x00ff0000 & b;
  buffer[22] = 0xff000000 & b;

  buffer[23] = makeCRC(buffer);
  return buffer;
}

function waitForPlatformReady(toolId, queryDelay, timeout) {
  const buffer = new Buffer(9);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x06;

  // Command Type
  buffer[2] = 0x8d;
  
  // Tool ID of the build platform to wait for
  buffer[3] = 0xff & toolId;

  // Delay between query packets sent to the tool, in ms (nominally 100 ms)
  buffer[4] = 0xff00 & queryDelay;
  buffer[5] = 0x00ff & queryDelay;

  // Timeout before continuing without tool ready, in seconds (nominally 1 minute)
  buffer[6] = 0xff00 & timeout;
  buffer[7] = 0x00ff & timeout;

  buffer[8] = makeCRC(buffer);
  return buffer;
}

function queueExtendedPoint(x, y, z, a, b, duration, axes) {
  const buffer = new Buffer(29);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x1a;

  // Command Type
  buffer[2] = 0x8e;
  
  // X coordinate, in steps
  buffer[3]  = (0x000000ff & x) >>  0;
  buffer[4]  = (0x0000ff00 & x) >>  8;
  buffer[5]  = (0x00ff0000 & x) >> 16;
  buffer[6]  = (0xff000000 & x) >> 24;

  // Y coordinate, in steps
  buffer[7]  = (0x000000ff & y) >>  0;
  buffer[8]  = (0x0000ff00 & y) >>  8;
  buffer[9]  = (0x00ff0000 & y) >> 16;
  buffer[10] = (0xff000000 & y) >> 24;

  // Z coordinate, in steps
  buffer[11]  = (0x000000ff & z) >>  0;
  buffer[12]  = (0x0000ff00 & z) >>  8;
  buffer[13]  = (0x00ff0000 & z) >> 16;
  buffer[14]  = (0xff000000 & z) >> 24;

  // A coordinate, in steps
  buffer[15]  = (0x000000ff & a) >>  0;
  buffer[16]  = (0x0000ff00 & a) >>  8;
  buffer[17]  = (0x00ff0000 & a) >> 16;
  buffer[18]  = (0xff000000 & a) >> 24;

  // B coordinate, in steps
  buffer[19]  = (0x000000ff & b) >>  0;
  buffer[20]  = (0x0000ff00 & b) >>  8;
  buffer[21]  = (0x00ff0000 & b) >> 16;
  buffer[22]  = (0xff000000 & b) >> 24;

  // Duration of the motion in microseconds
  buffer[23]  = (0x000000ff & duration) >>  0;
  buffer[24]  = (0x0000ff00 & duration) >>  8;
  buffer[25]  = (0x00ff0000 & duration) >> 16;
  buffer[26]  = (0xff000000 & duration) >> 24;

  buffer[27] = axesArrayToBitfield(axes);

  buffer[28] = makeCRC(buffer);
  return buffer;
}



// 0 - 255 for each
function setRgbLed(red, green, blue, blink) {
  const buffer = new Buffer(9);
  // Hello
  buffer[0] = 0xd5;

  // Length of payload
  buffer[1] = 0x06;

  // Command Type
  buffer[2] = 0x92;

  // Red
  buffer[3] = red & 0xff;
  
  // Green
  buffer[4] = green & 0xff;
  
  // Blue
  buffer[5] = blue & 0xff;
  
  // Blink rate
  // 0 is on constant, 1 is the fastest, 255 is the slowest
  buffer[6] = blink & 0xff;
  
  // Reserved
  buffer[7] = 0x00;

  buffer[8] = makeCRC(buffer);
  return buffer;
}

function makeCRC(byteArray) {
  var crc = 0;
  for (var i = 2; i < byteArray[1] + 2; i++) {
    var currentByte = byteArray[i];
    for (var j = 0; j < 8; j++) {
      var mix = (crc ^ currentByte) & 0x01;
      crc = crc >> 1;
      if (mix) {
        crc = crc ^ 0x8c;
      }
      currentByte = currentByte >> 1;
    }
  }
  return crc;
}
