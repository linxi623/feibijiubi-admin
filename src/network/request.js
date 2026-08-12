import axios from 'axios';
import { ElMessage } from 'element-plus';
import store from '../store';
import router from '../router';
import { removeToken } from '@/config/app';

const instance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
});

function resetLoginState() {
  store.state.isLogin = false;
  store.state.user = {};
  store.state.isLoading = false;
  removeToken();
}

function redirectToLogin() {
  if (router.currentRoute.value.path !== '/login') {
    router.push('/login');
  }
}

instance.interceptors.response.use(
  response => {
    const { code, message } = response.data || {};
    if (code !== 200) {
      ElMessage.error(message || '请求处理失败');
      if (message === '您不是管理员，无权访问') {
        resetLoginState();
        redirectToLogin();
      }
    }
    return response;
  },
  error => {
    const response = error.response;
    const isUnauthorized = response?.status === 401
      || response?.headers?.message === 'not login';

    if (isUnauthorized) {
      resetLoginState();
      ElMessage.error('请登录后查看');
      redirectToLogin();
    } else {
      store.state.isLoading = false;
      ElMessage.error(response?.data?.message || '菲比啾比服务暂时不可用');
    }
    return Promise.reject(error);
  },
);

export function get(url, config = {}) {
  return instance.get(url, config);
}

export function post(url, data, config) {
  return instance.post(url, data, config);
}

export default instance;
