// A fake M-profile core behind GDB's remote protocol: registers, breakpoints that are only
// remembered, and memory that reads as zeros. Enough for a session, not for running code.

const NAMES = [...Array(13).keys()].map((i) => `r${i}`).concat('sp', 'lr', 'pc', 'xpsr');
const TARGET_XML = '<?xml version="1.0"?><!DOCTYPE target SYSTEM "gdb-target.dtd"><target>' +
  '<architecture>arm</architecture><feature name="org.gnu.gdb.arm.m-profile">' +
  NAMES.map((name) => `<reg name="${name}" bitsize="32"/>`).join('') + '</feature></target>';

const hex32 = (value) => [0, 8, 16, 24].map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, '0')).join('');
const checksum = (data) => ([...data].reduce((sum, c) => sum + c.charCodeAt(0), 0) & 0xff).toString(16).padStart(2, '0');

// `send` takes the bytes for GDB.
export function fakeTarget(send) {
  const registers = new Array(NAMES.length).fill(0);
  registers[13] = 0x20001000;
  registers[16] = 0x01000000;
  let acks = true, breakpoint = 0, buffer = '', onContinue = () => {};
  const encoder = new TextEncoder();
  const reply = (data) => send(encoder.encode(`$${data}#${checksum(data)}`));

  function handle(packet) {
    if (packet.startsWith('qSupported')) return reply('PacketSize=4000;QStartNoAckMode+;qXfer:features:read+');
    if (packet === 'QStartNoAckMode') { reply('OK'); acks = false; return; }
    if (packet.startsWith('qXfer:features:read:target.xml:')) {
      const [offset, length] = packet.split(':')[4].split(',').map((n) => parseInt(n, 16));
      const end = offset + length >= TARGET_XML.length;
      return reply((end ? 'l' : 'm') + TARGET_XML.slice(offset, offset + length));
    }
    if (packet === '?') return reply('T05thread:1;');
    if (packet === 'g') return reply(registers.map(hex32).join(''));
    if (packet[0] === 'p') return reply(hex32(registers[parseInt(packet.slice(1), 16)] ?? 0));
    if (packet[0] === 'm') return reply('00'.repeat(parseInt(packet.split(',')[1], 16)));
    if (packet[0] === 'Z') breakpoint = parseInt(packet.split(',')[1], 16);
    if ('MZzHT'.includes(packet[0]) || packet === 'D') return reply('OK');
    if (packet === 'qfThreadInfo') return reply('m1');
    if (packet === 'qsThreadInfo') return reply('l');
    if (packet === 'qAttached') return reply('1');
    if (packet === 'vCont?') return reply('vCont;c;C;s;S');
    if (packet === 's' || packet.startsWith('vCont;s')) { registers[15] += 2; return reply('T05thread:1;'); }
    if (packet === 'c' || packet.startsWith('vCont;c')) return onContinue();
    reply('');
  }

  return {
    // Resolves when GDB next resumes the core, which it does only after `^running`.
    continued: () => new Promise((resolve) => { onContinue = resolve; }),
    receive(bytes) {
      for (const c of new TextDecoder().decode(bytes)) {
        if (!buffer && (c === '+' || c === '-')) continue;
        buffer += c;
        const end = buffer.indexOf('#');
        if (end >= 0 && buffer.length >= end + 3) {
          const packet = buffer.slice(1, end);
          buffer = '';
          if (acks) send(encoder.encode('+'));
          handle(packet);
        }
      }
    },
    // What a pause does: the core halts, here at the last breakpoint, answering the continue.
    halt() {
      registers[15] = breakpoint;
      reply('T05thread:1;');
    },
  };
}
