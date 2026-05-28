import { readFileSync } from 'node:fs';
import { defineConfig } from 'wxt';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: ({ mode }) => {
    const isDev = mode !== 'production';
    return {
      name: isDev ? 'TabSquad (dev)' : 'TabSquad',
      description: 'Keep tab groups organized: route links spawned from a group elsewhere.',
      version_name: isDev ? `${pkg.version}-dev` : undefined,
      permissions: ['tabs', 'tabGroups', 'webNavigation', 'storage', 'history'],
      action: {
        default_title: isDev ? 'TabSquad (dev)' : 'TabSquad',
        default_icon: {
          16: 'icon/16.png',
          32: 'icon/32.png',
        },
        default_popup: 'options.html',
      },
    };
  },
});
