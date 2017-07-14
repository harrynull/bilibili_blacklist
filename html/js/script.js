var app = new Vue({
  el: '#main-container',
  data: {
    blacklist: [],
    sharelist: [],
    notLogin: document.cookie.indexOf('bilibili_cookies=') == -1,
    uid: function () {
      var arr, reg = new RegExp("(^| )uid=([^;]*)(;|$)");
      if (arr = document.cookie.match(reg))
        return unescape(arr[2]);
      else
        return null;
    }(),
    detailid: 0,
    detailjson: "{}",
    apply_status: {},
    tip: document.cookie.indexOf('tip=') != -1
  },
  methods: {
    refreshBlacklist: function () {
      this.$http.get('fetch_blacklist').then(response => {
        if (response.body.code != undefined) {
          console.log("Failed to fetch blacklist: " + response.body.code);
          return;
        }
        this.blacklist = response.body;
      }, response => {
        console.log("Failed to fetch blacklist")
      });
    },
    apply: function (id) {
      if (this.notLogin) {
        window.location.href = "login.html";
        return;
      }
      if (this.apply_status[this.detailid] != undefined) return;
      this.$http.post('apply', { "id": id }).then(response => {
        this.$set(this.apply_status, id, true);
        sessionStorage.apply_status = JSON.stringify(this.apply_status);
        setTimeout(this.refreshBlacklist, 500);
        this.tipIfNeeded();
      }, response => {
        console.log("Failed to fetch blacklist")
      });
    },
    removeItem: function (id) {
      this.$http.post('del_item', { "ids": id }).then(response => {
        setTimeout(this.refreshBlacklist, 500);
        this.tipIfNeeded();
      }, response => {
        console.log("Failed");
      });
    },
    detail: function (id) {
      for (let item of this.sharelist) {
        if (item._id == id) {
          this.detailid = id;
          this.detailjson = item;
          $("#detail_modal").modal();
        }
      }
    },
    postComment: function () {
      comment_input=$("#comment_content")
      if(comment_input.val()==""){
        comment_input.focus();
      }
      this.$http.post('comment', { "id": this.detailid, "content": comment_input.val() }).then(response => {
        this.detailjson.comments.push({ "uid": this.uid, "content": comment_input.val() });
        comment_input.val("");
      }, response => {
        console.log("Failed to comment");
      });
    },
    getTime: function (time) {
      var d = new Date();
      d.setTime(time);
      return d.toLocaleString();
    },
    tipIfNeeded: function () {
      if (!this.tip) {
        this.tip = true;
        var date = new Date();
        date.setTime(date.getTime + 12 * 30 * 24 * 3600 * 1000);
        document.cookie = "tip=1; expires=" + date.toGMTString();

        alert("修改成功，请打开任意一个B站视频，点击播放器右侧【屏蔽设定】里的【同步屏蔽列表】以生效修改！");
      }
    }
  },
  mounted: function () {
    if (!this.notLogin) this.refreshBlacklist();
    try { this.apply_status = JSON.parse(sessionStorage.apply_status); }
    catch (ex) { this.apply_status = {}; }
    this.$http.get('fetch_sharelist').then(response => {
      this.sharelist = response.body.sort(function (x, y) { return x.usage < y.usage ? 1 : -1; });
    }, response => {
      console.log("Failed to fetch sharelist");
    });
  }
});
