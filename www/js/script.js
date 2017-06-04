var app = new Vue({
  el: '#main-container',
  data: {
    blacklist: [],
    sharelist: [],
    notLogin: document.cookie.indexOf('bilibili_cookies=')==-1,
    uid: function(){
        var arr,reg=new RegExp("(^| )uid=([^;]*)(;|$)");
        if(arr=document.cookie.match(reg))
            return unescape(arr[2]);
        else
            return null;
    }(),
    detailid: 0,
    detailjson: "{}",
    apply_status: {}
  },
  methods: {
    refreshBlacklist: function(){
      this.$http.get('fetch_blacklist').then(response => {
        if(response.body.code!=undefined){
          console.log("Failed to fetch blacklist: "+response.body.code);
          return;
        }
        this.blacklist = response.body;
      }, response => {
        console.log("Failed to fetch blacklist")
      });
    },
    apply: function(id){
      if(this.notLogin){
          window.location.href="login.html"; 
          return;
      }
      if(this.apply_status[this.detailid]!=undefined) return;
      this.$http.post('apply',{"id":id}).then(response => {
          this.apply_status[id]=true;
          sessionStorage.apply_status=JSON.stringify(this.apply_status);
          setTimeout(this.refreshBlacklist, 500);
      }, response => {
        console.log("Failed to fetch blacklist")
      });  
    },
    removeItem: function(id){		
           this.$http.post('del_item', {"ids":id}).then(response => {		
               setTimeout(this.refreshBlacklist, 500);
           },response => {		
               console.log("Failed");
           });		
       },
    detail: function(id){
      this.$http.get('view/'+id).then(response => {
        this.detailid=id;
        this.detailjson = response.body[0];
        $("#detail_modal").modal();
      }, response => {
        console.log("Failed to fetch detail");
      });
    },
    postComment: function(){
      this.$http.post('comment',{"id": this.detailid,"content":$("#comment_content").val()}).then(response => {
        this.detailjson.comments.push({"uid": this.uid, "content":$("#comment_content").val()});
        $("#comment_content").val("");
      }, response => {
        console.log("Failed to comment");
      });
    },
    getTime: function(time){
        var d=new Date();
        d.setTime(time);
        return d.toLocaleString();
    }
  },
  mounted: function() {
      if(!this.notLogin) this.refreshBlacklist();
      try{this.apply_status=JSON.parse(sessionStorage.apply_status);}
      catch(ex){this.apply_status={};}
      this.$http.get('fetch_sharelist').then(response => {
        this.sharelist = response.body.sort(function(x,y){return x.usage<y.usage?1:-1;});
      }, response => {
        console.log("Failed to fetch sharelist");
      });
  }
});
