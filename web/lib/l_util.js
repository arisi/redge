
window.stamp = () => {
  return (new Date).getTime();
}

window.log_colored = (color, s, ...args) => {
  var stamps = new Date(stamp()).toISOString()
  log("%c" + stamps + " " + sprintf(s, ...args), `color: ${color}; font-weight: 900;`);
}

for (var color of ['magenta', 'red', 'darkcyan', 'green', 'blue', 'yellow']) {
  window[`log_${color}`] = new Function('s, ...args', `log_colored('${color}', sprintf(s, ...args))`);
}
