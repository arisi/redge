

Handlebars.registerHelper('for', function(from, to, incr, block) {
  var accum = '';
  for (var i = from; i < to; i += incr)
    accum += block.fn(i);
  return accum;
});

Handlebars.registerHelper('switch', function(value, options) {
  this.switch_value = value;
  return options.fn(this);
});

Handlebars.registerHelper('case', function(value, options) {
  if (value == this.switch_value) {
    return options.fn(this);
  }
});

Handlebars.registerHelper('default', function(value, options) {
  return true; ///We can add condition if needs
});

Handlebars.registerHelper('ifEq', function(arg1, arg2, options) {
  return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('hex', (dec, size) => {
  if (dec == undefined)
    return "          "
  if (size == 2)
    return sprintf("0x%02X", dec)
  else if (size == 4)
    return sprintf("0x%04X", dec)
  return sprintf("0x%08X", dec)
})

window.Handlebars.registerHelper('select', (value, options) => {
  var $el = $('<select />').html(options.fn(this));
  $el.find('[value="' + value + '"]').attr({ 'selected': 'selected' });
  return $el.html();
})
