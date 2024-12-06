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
  row = 0;
  old_row=[]
  old_sf=0;
  bi = 0;
  avgs = [];
  avgsum=0;
  avg=0;

  col(v) {
    var g=40;
    var r=40;
    var bb=40;
    if (v<0.1)
      v=this.old_row[i]
    if (v<3) {
      g=155*(3-v) + 100;
    } else {
      r=20*(20-(v-3)) + 100;
    }
    return`rgba(${r}, ${g}, ${bb}, 1)`
  }

  constructor(mq, conf, id, name) {
    super(mq, conf, id, name);
    console.log("PowerSniffer Canvas constructed!!");
    this.cal_phase = 4;
    this.r = mq.req_ind("+", 'log_write', "zpower", async (a, b) => {
      if (b.stream == 10) {
        this.sx = this.width();
        this.sy = this.height();
        s=[]
        for (var p=0; p < b.bdata.length;p+=2) {
          var v = (b.bdata.charCodeAt(p+1)<<8 )+ b.bdata.charCodeAt(p);
          s.push(Math.round(1000000*(4.096*v/13096)/100)/1000)
        }

        //console.log("x",s);
        // this.rect(0, this.row*20, this.sx, 20, "white", "white");
        // this.text(10, this.row*20, `${s}`, 'black');
        //this.rect(0, this.row*20, this.sx, 20, "white", "white");
        var sum=0;
        for (var i = 0; i<25; i++) {
          var x=i*60;
          var v = s[i]
          if (v<0.1)
            v=this.old_row[i]
          
          this.rect(x+1, this.sy-18, 60-3, 20, "white", this.col(v));
          this.text(x+10, this.sy-4, sprintf("%.3f",v), 'white');
          sum+=v;
        }
        var sf = parseInt(b.data.substring(2));
        if (sf!=this.old_sf) {
          this.bi=1;
        } else 
          this.bi+=1;
        this.text(25*60+10, this.sy-4, `${sf}.${this.bi} `, 'blue');
        this.rect(26*60+10, this.sy-18, 10+sum, 20, "white", this.col(sum/25));
        this.text(26*60+10, this.sy-4, sprintf("%.3f",sum/25), 'white');
        this.avgs.push(sum/25)
        this.avgsum += sum/25;
        if (this.avgs.length>60) {
          var vex= this.avgs.shift();
          this.avgsum -= vex;
        }
        this.avg = this.avgsum/this.avgs.length
        //console.log(this.avgs);
        
        this.row+=1;
        this.old_row=s
        this.old_sf = sf;
        this.scroll(0, 0,this.sx, this.sy, 0, -20, "white")

        this.rect(30*60+10, 0, 360, 200, "red", "blue");

        this.text(30*60+10+50, 200-50, sprintf("%6.2fmW",this.avg), 'white',60);
        //this.rect(30*60+10, 10, 210, 200, "red", "");

        this.rect(30*60+10, 30,  10+this.avg*20, 20, "red", this.col(this.avg));

        var max = Math.max.apply(Math, this.avgs)
        this.rect(30*60+10, 0, 10+max*20, 20, "red", this.col(max));

        var min = Math.min.apply(Math, this.avgs)
        this.rect(30*60+10, 60, 10+min*20, 20, "red", this.col(min));
        this.text(30*60+10+10, 200-10, sprintf("%6.2fmW",min), 'white',30);
        this.text(30*60+10+10+200, 200-10, sprintf("%6.2fmW",max), 'white',30);
      }
    });

    // this.r = mq.req_ind('+', 'adc_ind_ak', "ind_"+this.name, (a, b) => {
    //   var x = (4000 - b.V_WIPERX) / 10
    //   var y = (b.V_WIPERY) / 10
    //   this.sx = this.width();
    //   this.sy = this.height();
    //   if (b.id)
    //     console.log(b, x, y, b.V_WIPERX, b.V_WIPERY, b.V_WIPERX_VAR, b.V_WIPERY_VAR);
    //   if ((b.V_WIPERX < 3700) && (b.V_WIPERY < 3700)) {
    //     this.rect(0, 0, this.sx, 10, "white", "white");
    //     this.rect(x, 0, 2, 10, "blue", "blue");

    //     this.rect(0, this.sy - 10, this.sx, 10, "white", "white");
    //     this.rect(x, this.sy - 10, 2, 10, "blue", "blue");

    //     this.rect(0, 0, 10, this.sy, "white", "white");
    //     this.rect(0, y, 10, 2, "blue", "blue");
    //     $$$("touch").update({ V_WIPERX: x })
    //     $$$("touch").update({ V_WIPERY: y })
    //     if (b.id != 999) {
    //       //this.circle(x, y, 2, "gray");
    //       if (this.o_x != -1) {
    //         this.line(x, y, this.o_x, this.o_y, "gray", 0.3);
    //         var xx = (x-this.min_x) * this.m[0][0] + (y-this.min_y)  * this.m[0][1];
    //         var yy = (x - this.min_x) * this.m[1][0] + (y - this.min_y) * this.m[1][1];
    //         if ($$$("touch2"))
    //           $$$("touch2").line(this.HALF_X + xx, yy+this.HALF_X, this.HALF_X + this.o_xx, this.o_yy+this.HALF_X, "gray", 0.3);
    //         this.o_xx = xx;
    //         this.o_yy = yy;

    //       }
    //       this.o_x = x;
    //       this.o_y = y;
    //     } else {

    //       this.clicks.push([x, y])
    //       this.o_x = -1;
    //       this.o_y = -1;
    //       if (this.cal_phase < 4) {
    //         this.cals[this.cal_phase++] = [Math.round(x), Math.round(y)]
    //         $$$("touch").update({ CALS: JSON.stringify(this.cals) })
    //         if (this.cal_phase == 4) {
    //           this.min_x = 5000;
    //           this.max_x = 0;
    //           this.min_y = 5000;
    //           this.max_y = 0;
    //           for (var i = 0; i < 4; i++) {
    //             if (this.cals[i][0] < this.min_x)
    //               this.min_x = this.cals[i][0];
    //             if (this.cals[i][0] > this.max_x)
    //               this.max_x = this.cals[i][0];
    //             if (this.cals[i][1] < this.min_y)
    //               this.min_y = this.cals[i][1];
    //             if (this.cals[i][1] > this.max_y)
    //               this.max_y = this.cals[i][1];
    //           }
    //           console.log("cal done", this.min_x, this.max_x, this.min_y, this.max_y);
    //           // for (var i = 0; i < 4; i++) {
    //           //   this.cals[i][0] -= this.min_x;
    //           //   this.cals[i][1] -= this.min_y;
    //           // }
    //           $$$("touch").update({
    //             RANGE: JSON.stringify(
    //               [[this.min_x, this.max_x, this.min_y, this.max_y],
    //               [this.max_x - this.min_x], [this.max_y - this.min_y]
    //               ]
    //             )
    //           })
    //           $$$("touch").update({ CALS: JSON.stringify(this.cals) })
    //         }
    //       }
    //       this.wiper()
    //     }
    //     //this.text((4000 - b.V_WIPERX) / 10, b.V_WIPERY / 10, `${x},${y}`, 'black');
    //   }
    // });
    // register_button_handler("TOUCH_CLEAR", "touch", async (obj) => {
    //   console.log("nappi TOUCH_CLEAR", obj);
    //   this.cals = [[], [], [], []];
    //   this.cal_phase = 0;
    //   $$$("touch").update({ CALS: JSON.stringify(this.cals) })
    //   this.clicks = []
    //   this.wiper()
    // });
    // this.wiper();

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
