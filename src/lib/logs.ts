import chalk from 'chalk'

type Status = 'success' | 'error' | 'info' | 'warn' | 'debug'

type LogEventInput = {
  message: string
  status: Status
  scope?: string
  time?: Date
}

const colorByStatus: Record<Status, (s: string) => string> = {
  success: (s) => chalk.green(s),
  error: (s) => chalk.red(s),
  info: (s) => chalk.blue(s),
  warn: (s) => chalk.yellow(s),
  debug: (s) => chalk.magenta(s),
}

const iconByStatus: Record<Status, string> = {
  success: '✔',
  error: '✖',
  info: 'ℹ',
  warn: '⚠',
  debug: '●',
}

function fmtTime(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const MM = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`
}

export const logEvent = ({ message, status, scope, time }: LogEventInput) => {
  const color = colorByStatus[status] ?? ((s: string) => s)
  const icon = iconByStatus[status] ?? '•'

  const ts = chalk.dim(fmtTime(time))
  const sc = scope ? `${chalk.gray(`[${scope}]`)} ` : ''
  const st = chalk.bold(status.toUpperCase())

  const line = `${ts} ${sc}${icon} ${st}  ${chalk.dim('->')} ${message}`

  if (status === 'error') {
    console.error(color(line))
  } else {
    console.log(color(line))
  }
}

export const log = {
  success: (message: string, scope?: string) => logEvent({ message, scope, status: 'success' }),
  error: (message: string, scope?: string) => logEvent({ message, scope, status: 'error' }),
  info: (message: string, scope?: string) => logEvent({ message, scope, status: 'info' }),
  warn: (message: string, scope?: string) => logEvent({ message, scope, status: 'warn' }),
  debug: (message: string, scope?: string) => logEvent({ message, scope, status: 'debug' }),
}
