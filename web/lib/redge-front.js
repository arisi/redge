class RedgeFront {
  conf;
  mq;
  state;
  id;

  constructor(mq, conf, id, name) {
    this.state = {
      created: RedgeFront.stamp(),
      updated: RedgeFront.stamp(),
    }
    this.state = {
      ...this.state,
      id,
    };
    this.id = id;
    this.mq = mq;
    this.conf = conf;
    this.name = name;

    log_blue("EL: '%s' constructed id=%d.", this.name, this.id);
  }

  deconstructor() {
    log_blue("EL: '%s' deconstructed id=%d", this.name, this.id);
  }

  static stamp() {
    return (new Date).getTime()
  }

  static delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  disable(key) {
    $(`#${this.id}_${key}`).prop('disabled', true)
  }
  enable(key) {
    $(`#${this.id}_${key}`).prop('disabled', false)
  }

  render(rebuild) {
    log_blue("EL: '%s' render '%s' id=%d rebuild=%s", this.name, this.id, rebuild);
    window.update_element(`#${this.id}`, rebuild);
  }

  sync(req) {
    log_blue("EL: '%s' sync id=%d '%s'", this.name, this.id, JSON.stringify(req));
  }

  populate(req) {
    log_blue("EL: '%s' populate id=%d '%s'", this.name, this.id, req);
  }

}