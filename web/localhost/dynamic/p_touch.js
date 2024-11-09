class RedgeTouch extends RedgeCanvas {
  rev = 'abba3x'
  // [[82,112],[83,284],[320,281],[315,111]]
  clicks = [[82,112],[83,284],[320,281],[315,111]]
  cals = [[82,112],[83,284],[320,281],[315,111]]
  cal_phase = 4;
  o_x = -1;
  o_y = -1;
  m = [[1.57*2, 0], [0, 1*2]];
  HALF_X = 10

  constructor(mq, conf, id, name) {
    super(mq, conf, id, name);
    console.log("Touch constructed!!");
    this.cal_phase = 4;

    this.min_x = 5000;
    this.max_x = 0;
    this.min_y = 5000;
    this.max_y = 0;
    for (var i = 0; i < 4; i++) {
      if (this.cals[i][0] < this.min_x)
        this.min_x = this.cals[i][0];
      if (this.cals[i][0] > this.max_x)
        this.max_x = this.cals[i][0];
      if (this.cals[i][1] < this.min_y)
        this.min_y = this.cals[i][1];
      if (this.cals[i][1] > this.max_y)
        this.max_y = this.cals[i][1];
    }
    console.log("cal done", this.min_x, this.max_x, this.min_y, this.max_y);


    this.r = mq.req_ind('+', 'adc_ind_ak', "ind_"+this.name, (a, b) => {
      var x = (4000 - b.V_WIPERX) / 10
      var y = (b.V_WIPERY) / 10
      this.sx = this.width();
      this.sy = this.height();
      if (b.id)
        console.log(b, x, y, b.V_WIPERX, b.V_WIPERY, b.V_WIPERX_VAR, b.V_WIPERY_VAR);
      if ((b.V_WIPERX < 3700) && (b.V_WIPERY < 3700)) {
        this.rect(0, 0, this.sx, 10, "white", "white");
        this.rect(x, 0, 2, 10, "blue", "blue");

        this.rect(0, this.sy - 10, this.sx, 10, "white", "white");
        this.rect(x, this.sy - 10, 2, 10, "blue", "blue");

        this.rect(0, 0, 10, this.sy, "white", "white");
        this.rect(0, y, 10, 2, "blue", "blue");
        $$$("touch").update({ V_WIPERX: x })
        $$$("touch").update({ V_WIPERY: y })
        if (b.id != 999) {
          //this.circle(x, y, 2, "gray");
          if (this.o_x != -1) {
            this.line(x, y, this.o_x, this.o_y, "gray", 0.3);
            var xx = (x-this.min_x) * this.m[0][0] + (y-this.min_y)  * this.m[0][1];
            var yy = (x - this.min_x) * this.m[1][0] + (y - this.min_y) * this.m[1][1];
            if ($$$("touch2"))
              $$$("touch2").line(this.HALF_X + xx, yy+this.HALF_X, this.HALF_X + this.o_xx, this.o_yy+this.HALF_X, "gray", 0.3);
            this.o_xx = xx;
            this.o_yy = yy;

          }
          this.o_x = x;
          this.o_y = y;
        } else {

          this.clicks.push([x, y])
          this.o_x = -1;
          this.o_y = -1;
          if (this.cal_phase < 4) {
            this.cals[this.cal_phase++] = [Math.round(x), Math.round(y)]
            $$$("touch").update({ CALS: JSON.stringify(this.cals) })
            if (this.cal_phase == 4) {
              this.min_x = 5000;
              this.max_x = 0;
              this.min_y = 5000;
              this.max_y = 0;
              for (var i = 0; i < 4; i++) {
                if (this.cals[i][0] < this.min_x)
                  this.min_x = this.cals[i][0];
                if (this.cals[i][0] > this.max_x)
                  this.max_x = this.cals[i][0];
                if (this.cals[i][1] < this.min_y)
                  this.min_y = this.cals[i][1];
                if (this.cals[i][1] > this.max_y)
                  this.max_y = this.cals[i][1];
              }
              console.log("cal done", this.min_x, this.max_x, this.min_y, this.max_y);
              // for (var i = 0; i < 4; i++) {
              //   this.cals[i][0] -= this.min_x;
              //   this.cals[i][1] -= this.min_y;
              // }
              $$$("touch").update({
                RANGE: JSON.stringify(
                  [[this.min_x, this.max_x, this.min_y, this.max_y],
                  [this.max_x - this.min_x], [this.max_y - this.min_y]
                  ]
                )
              })
              $$$("touch").update({ CALS: JSON.stringify(this.cals) })
            }
          }
          this.wiper()
        }
        //this.text((4000 - b.V_WIPERX) / 10, b.V_WIPERY / 10, `${x},${y}`, 'black');
      }
    });
    register_button_handler("TOUCH_CLEAR", "touch", async (obj) => {
      console.log("nappi TOUCH_CLEAR", obj);
      this.cals = [[], [], [], []];
      this.cal_phase = 0;
      $$$("touch").update({ CALS: JSON.stringify(this.cals) })
      this.clicks = []
      this.wiper()
    });
    this.wiper();

  }
  destructor() {
    console.log("dah", this.rev, this.r)
    mq.unreq_ind("+", "adc_ind_ak", "ind_"+this.name)
    console.log("Touch destructor() **!**", this.r);
    delete (this.r)
  }

  wiper() {
    this.rect(0, 0, this.sx, this.sx, "white", "white");
    if ($$$("touch2"))
      $$$("touch2").rect(0, 0, this.sx, this.sx, "white", "white");
    for (var o of this.clicks) {
      this.circle(o[0], o[1], 6, "red");
      var x = o[0] - this.min_x;
      var y = o[1] - this.min_y;
      var xx = x * this.m[0][0] + y * this.m[0][1];
      var yy = x * this.m[1][0] + y * this.m[1][1];
      console.log(x, y, xx, yy);
      if ($$$("touch2"))
        $$$("touch2").circle(this.HALF_X + xx,this.HALF_X+ yy , 6, "blue");
    }
    for (var o of this.cals) {
      this.circle(o[0], o[1], 8, "red", "red");
      var x = o[0] - this.min_x;
      var y = o[1] - this.min_y;
      var xx = x * this.m[0][0] + y * this.m[0][1];
      var yy = x * this.m[1][0] + y * this.m[1][1];
      if ($$$("touch2"))
        $$$("touch2").circle(this.HALF_X + xx,this.HALF_X+yy, 8, "blue", "blue");
    }
  }
}
