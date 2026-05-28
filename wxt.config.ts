import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: 'TabSquad',
    description: 'Keep tab groups organized: route links spawned from a group elsewhere.',
    permissions: ['tabs', 'tabGroups', 'webNavigation', 'storage', 'history'],
    action: {
      default_title: 'TabSquad',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
      default_popup: 'options.html',
    },
  },
});
