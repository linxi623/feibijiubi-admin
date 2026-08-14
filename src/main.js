import { createApp } from "vue";
import App from "./App.vue";
import ElementPlus from "element-plus";
import { ElMessage } from "element-plus";
import "element-plus/theme-chalk/index.css";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import { CloseBold, Select as SelectIcon } from "@element-plus/icons-vue";
import http, { get, post } from "./network/request";
import router from "./router";
import store from "./store";
import VueParticles from "vue3-particles"; // 粒子效果模板
// 全局样式表
import "./assets/css/base.css";

const app = createApp(App);

// 添加全局变量
app.config.globalProperties.$message = ElMessage;
app.config.globalProperties.$axios = http;
app.config.globalProperties.$get = get;
app.config.globalProperties.$post = post;
app.use(ElementPlus, { locale: zhCn });
app.component("CloseBold", CloseBold);
app.component("SelectIcon", SelectIcon);

app.use(store);
app.use(router);
app.use(VueParticles);
app.mount("#app");
