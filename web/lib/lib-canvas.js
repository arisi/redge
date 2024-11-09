
class RedgeCanvas extends RedgeFront {

  constructor(mq, conf, id, name, fdata, html) {
    super(mq, conf, id, name);
    this.state.fdata = fdata;
    console.log(`canvas constructor! ${this.name} ${this.id}`, fdata, html);
    this.state.canvas = "";
    this.canvas = document.getElementsByName(this.name)[0];
    console.log("CANVAS" ,this.canvas);
    this.ctx = this.canvas.getContext("2d");
    $(this.canvas).css("width", "100%");
    this.ctx.font = "10px Arial";
    console.log(`canvas setter ${this.name} ${this.id}`);
  }
  destructor() {
    super.deconstructor()
    console.log(`canvas destructor ${this.name}`);
  }
  sync(req) {
    console.log(`canvas sync ${this.name}`, req);
  }

  render(rebuild) {
    super.render(rebuild)
  }

  width() {
    return this.canvas.width;
  }
  height() {
    return this.canvas.height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  text(x, y, s, color = 'black') {
    this.ctx.font = "12px Roboto";
    this.ctx.fillStyle = color;
    this.ctx.textAlign = "start";
    this.ctx.strokeStyle = "none";
    this.ctx.fillText(s, x, y);
  }

  line(x1, y1, x2, y2, color = 'black', opacity = 1) {
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  rect(x, y, dx, dy, stroke = 'black', fill = 'none') {
    this.ctx.lineWidth = "1";
    if (fill != 'none') {
      this.ctx.fillStyle = fill;
      this.ctx.strokeStyle = stroke;
      this.ctx.fillRect(x, y, dx, dy);
    } else {
      this.ctx.strokeStyle = stroke;
      this.ctx.beginPath();
      this.ctx.rect(x, y, dx, dy);
      this.ctx.stroke();
    }
  }

  circle(x, y, r, stroke = 'black', fill = 'none') {
    this.ctx.lineWidth = "1";
    if (fill != 'none') {
      this.ctx.strokeStyle = stroke;
      this.ctx.fillStyle = fill;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, 2 * Math.PI);
      this.ctx.stroke();
      this.ctx.fill();
    } else {
      this.ctx.strokeStyle = stroke;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, 2 * Math.PI);
      this.ctx.stroke();
    }
  }
  scroll(x, y, w, h, dx, dy, fill = 'white') {
    if (dx > 0)
      this.rect(x, y, dx, h, '', fill)
    if (dx < 0)
      this.rect(x + w + dx, y, dx, h, '', fill)
    if (dy > 0)
      this.rect(x, y, w, dy, '', fill)
    if (dy < 0) {
      var i = this.ctx.getImageData(x, y-dy, w, h+dy)
      this.ctx.putImageData(i, x, y )

      this.rect(x, y + h + dy, w, -dy, '', fill)
    }
  }

  dim() {
    // var box = this.canvas.getBoundingClientRect()
    // console.log("siz",box);
    // console.log("siz2",box.bottom-box.top, box.right - box.left);
    // console.log("siz3",$(`#${this.id}`).width(), $(`#${this.id}`).height());
    return {

      w: $(`#${this.id}`).width() * 0.85,
      h: $(`#${this.id}`).height() * 0.85
    }
  }

  // tick() {
  //   var d = this.dim()
  //   this.scroll(1,1,d.w,d.h,1,0)
  // }

  getter(req) {
    console.log(`canvas getter ${this.name}`, req);
  }

  onEvent(obj) {
    console.log(`canvas onEvent ${this.name}`, obj);
    obj.e.preventDefault();
  }
}