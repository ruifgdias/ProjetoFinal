/* global Backbone, app */

window.SideBarView = Backbone.View.extend({
  databaseselect: false,
  socketsidebar: null,
  events: {
    "click .site-option": "select_site",
    "click #site-ativo": "stopevent",
    "click .select-item-menu": "navsidebar"
  },
  stopevent: function (e) {
    e.preventDefault();
    $('ul.sidebar-menu li.active').removeClass("active");
    $(e.currentTarget).parent().addClass("active");
  },
  select_site: function (e) {
    var self = this;
    e.preventDefault();
    $(e.currentTarget).parent().parent("ul > li:first").children("a").children("span").text($(e.currentTarget).text());
    $('ul.sidebar-menu ul.site-title li a i.fa-dot-circle-o').removeClass("fa-dot-circle-o").addClass("fa-circle-o");
    $(e.currentTarget).children().children().removeClass($(e.currentTarget).children().attr("class")).addClass("fa fa-dot-circle-o");
    $('ul.sidebar-menu ul.site-title li.active').removeClass("active");
    $(e.currentTarget).addClass("active");
    this.databaseselect = true;
    self.socketsidebar.setSite(window.profile.id, $(e.currentTarget).text().trim());
  },
  navsidebar: function (e) {
    var self = this;
    $('ul.sidebar-menu li.active').removeClass("active");
    $(e.currentTarget).parent().addClass("active");
    e.preventDefault();
    if (self.databaseselect) {
      app.navigate($(e.currentTarget).data("nome"), {
        trigger: true
      });
    } else {
      alert("Selecione um Site.");
    }
  },
  initialize: function (opt) {
    this.socketsidebar = opt.socket;
  },
  addsitessidebar: function () {
    modem('GET', "/getAllDataBase",
            function (data) {
              var sitesAppend = "";
              for (var i = 0; i < data.length; i++) {
                sitesAppend += '<li class="site-option"><a href="#"><i class="fa fa-circle-o"></i> ' + data[i].db + '</a></li>';
              }
              $('ul.sidebar-menu ul.site-title').append(sitesAppend);
            },
            function (xhr, ajaxOptions, thrownError) {
              var json = JSON.parse(xhr.responseText);
              error_launch(json.message);
            }, {}
            );
  },
  render: function () {
    var self = this;
    $(this.el).html(this.template());
    return this;
  }
});
