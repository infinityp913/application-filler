import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Application Filler',
    description: 'Fill job and accelerator applications using your profile and Claude AI.',
    permissions: ['storage', 'activeTab', 'scripting', 'webNavigation'],
    host_permissions: ['<all_urls>'],
    action: {
      default_popup: 'popup.html',
      default_title: 'Application Filler',
    },
  },
});
