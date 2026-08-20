const fs = require('fs');
const path = require('path');
const morgan = require('morgan');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
const errorLogStream = fs.createWriteStream(path.join(logsDir, 'errors.log'), { flags: 'a' });

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

const requestTokens = {
  ip: (req) => getClientIp(req),
  ipv6: (req) => (getClientIp(req) || '').replace(/^::ffff:/, ''),
  userAgent: (req) => req.headers['user-agent'] || '-',
  referer: (req) => req.headers.referer || '-',
  origin: (req) => req.headers.origin || '-',
};

morgan.token('ip', requestTokens.ip);
morgan.token('ipv6', requestTokens.ipv6);
morgan.token('userAgent', requestTokens.userAgent);
morgan.token('referer', requestTokens.referer);
morgan.token('origin', requestTokens.origin);

const requestFormat =
  '[:date[iso]] IP=:ip :method :url STATUS=:status :response-time ms BYTES=:res[content-length] UA=":user-agent" ORIGIN=:origin REFERER=:referer';

morgan.format('full', requestFormat);

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function timestamp() {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function consoleLine(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function errorLine(message) {
  console.error(`[${timestamp()}] ${message}`);
}

const logger = {
  info: (message) => {
    consoleLine(message);
    errorLogStream.write(`[${timestamp()}] [INFO] ${message}\n`);
  },
  error: (message, err) => {
    errorLine(message);
    const detail = err ? ` | ${err.stack || err.message || err}` : '';
    errorLogStream.write(`[${timestamp()}] [ERROR] ${message}${detail}\n`);
  },
  accessLog: morgan('full', { stream: accessLogStream }),
  accessLogConsole: morgan('full', {
    skip: (req, res) => res.statusCode >= 400,
  }),
  accessLogConsoleErrors: morgan('full', {
    skip: (req, res) => res.statusCode < 400,
  }),
};

module.exports = logger;
