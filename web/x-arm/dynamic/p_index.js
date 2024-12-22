class RedgeIndex extends RedgeFront {
  constructor(mq, conf, id, name) {
    super(mq, conf, id, name);
    console.log("loading p_index.js");
  }
  deconstructor() {
    console.log("***** deconstructor indeksi");
    super.deconstructor()
  }
}