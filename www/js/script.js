var app = new Vue({
  el: '#main-container',
  data: {
    blacklist: [],
    sharelist: [],
    notLogin: document.cookie.indexOf('bilibili_cookies=')==-1,
  },
  methods: {
    refreshBlacklist: function(){
      this.$http.get('/fetch_blacklist').then(response => {
        if(response.body.code!=undefined){
          console.log("Failed to fetch blacklist: "+response.body.code);
          return;
        }
        sessionStorage.blacklist = response.body;
        this.blacklist = response.body;
      }, response => {
        console.log("Failed to fetch blacklist")
      });
    }
  },
  mounted: function() {
      this.refreshBlacklist();
      this.$http.get('/fetch_sharelist').then(response => {
        this.sharelist = response.body;
      }, response => {
        console.log("Failed to fetch sharelist");
      });
  }
});
