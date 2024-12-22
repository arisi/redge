class RedgeMenu extends RedgeFront {
  state = {
    menu: [
      { name: "Boards", icon: "chart-line-star" },
      { name: "Profile", icon: "profile-circle"
    }]
  }
  constructor(mq, conf, id, name, fdata) {
    super(mq, conf, id, name);
  }

  deconstructor() {
    super.deconstructor()
    deregister_button_handler("LOGIN_LOGIN", "index");
  }
}