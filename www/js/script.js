Vue.component('blacklist-item', {
  props: ['item'],
  methods: {
      removeItem: function(id){
          this.$http.post('/del_item', {"ids":id}).then(response => {
              this.$emit('refresh');
          },response => {
              console.log("Failed");
          });
      }
  },
  template: '<li>{{ ["Normal","Regex","User"][item.type] }} {{ item.filter }} <a href="javascript:void(0)" v-on:click="removeItem(item.id)">Del</a></li>'
});
Vue.component('share-item', {
  props: ['item'],
  template: '<li>{{item.name}} {{item.vote}} {{item.usage}} <a :href="\'view/\'+item._id">View</a> <a :href="\'apply/\'+item._id">Apply</a> <a :href="\'upvote/\'+item._id">Upvote</a></li>'
});

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