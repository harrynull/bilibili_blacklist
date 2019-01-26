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
    vote_choice: -1,
    tip: document.cookie.indexOf('tip=') != -1,
    sortBy: 'usage',
    page: 0,
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
      this.$http.post('apply', {
        "id": id
      }).then(response => {
        this.$set(this.apply_status, id, true);
        sessionStorage.apply_status = JSON.stringify(this.apply_status);
        setTimeout(this.refreshBlacklist, 500);
        this.tipIfNeeded();
      }, response => {
        console.log("Failed to fetch blacklist")
      });
    },
    removeItem: function (id) {
      this.$http.post('del_item', {
        "ids": id
      }).then(response => {
        setTimeout(this.refreshBlacklist, 500);
        this.tipIfNeeded();
      }, response => {
        console.log("Failed");
      });
    },
    detail: function (id) {
      this.vote_choice = -1;
      for (let item of this.sharelist.data) {
        if (item._id == id) {
          this.detailid = id;
          this.detailjson = item;
          $("#detail_modal").modal();
        }
      }
    },
    postComment: function () {
      if (this.notLogin) {
        window.location.href = "login.html";
        return;
      }
      comment_input = $("#comment_content")
      if (comment_input.val() == "") {
        comment_input.focus();
        return;
      }
      if (this.vote_choice == -1) {
        $("#good").css("color", "orange");
        $("#bad").css("color", "orange");
        return;
      }
      this.$http.post('comment', {
        "id": this.detailid,
        "content": comment_input.val(),
        "like": this.vote_choice
      }).then(response => {
        this.detailjson.comments.push({
          "uid": this.uid,
          "content": comment_input.val(),
          "like": this.vote_choice
        });
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
    },
    calcVote: function (item) {
      var like = 0;
      var dislike = 0;
      for (var comment of item.comments) {
        if (comment.like) like++;
        else if (comment.like === false) dislike++;
      }
      return [like, dislike];
    },
    calcVoteDisplay: function (item) {
      var vote = this.calcVote(item);
      var like = vote[0];
      var dislike = vote[1];
      if (like + dislike == 0) return "N/A";
      return Math.round(like / (like + dislike) * 100) + "% (" + like + "/" + (like + dislike) + ")";
    },
    vote: function (choice) { //choice: 1-like, 0-dislike
      if (choice == 1) {
        $("#good").css("color", "green");
        $("#bad").css("color", "black");
      } else {
        $("#good").css("color", "black");
        $("#bad").css("color", "red");
      }
      this.vote_choice = choice;
    },
    filters_preview: function (filters) {
      var ret = filters[0].filter;
      //var n = Math.min(Math.floor(filters.length/3),5);
      //for(var i=1;i<n;i++){
      //  ret+=", "+filters[i].filter;
      //}
      var n = 1;
      while (ret.length < 50 && n < filters.length)
        ret += ", " + filters[n++].filter;

      var more = filters.length - n;
      if (more != 0) ret += " 等" + more + "个屏蔽词";
      return ret;
    },
    refreshList: function () {
      this.$http.get('sharelist',{params: {page: this.page, filter: document.getElementById('tags').value.replace(", ", ","), sort: this.sortBy, dir: 'desc'}}).then(response => {
        this.sharelist = response.body;
      }, response => {
        console.log("Failed to fetch sharelist");
      });
    },
    sortByUsage: function () {
      this.sortBy = 'usage';
      this.refreshList();
    },
    sortByDate: function(){
      this.sortBy = 'time';
      this.refreshList();
    },
    goto_page: function(i){
      this.page = i;
      this.sharelist.data = [];
      this.refreshList();
    },
    pagination_pages: function() {
      var start = Math.max(1, this.page - 5);
      var stop = Math.min(start + 10, this.sharelist.last_page);
      var a=[start], b=start;
      while(b<stop){b++;a.push(b)}
      return a;
    }
  },
  mounted: function () {
    if (!this.notLogin) this.refreshBlacklist();
    try {
      this.apply_status = JSON.parse(sessionStorage.apply_status);
    } catch (ex) {
      this.apply_status = {};
    }
    this.refreshList();
    this.$http.get('tags').then(response => {
      var _this=this;
      $('#tags').tokenfield({
          autocomplete: {
            source: response.body,
            delay: 100
          },
          showAutocompleteOnFocus: true
        });
      $('#tags').change(function(){_this.page=0;_this.refreshList();});
    }, response => {
      console.log("Failed to fetch tag")
    });
  }
});
