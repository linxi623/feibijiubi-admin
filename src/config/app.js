export const APP_NAME = '菲比啾比管理端';
export const APP_NAME_EN = 'feibijiubi-admin';
export const TOKEN_KEY = 'feibijiubi_token';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
}
