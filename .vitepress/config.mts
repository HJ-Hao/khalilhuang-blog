import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "khalilhuang's blog",
  description: "khalilhuang's blog",
  srcDir: 'src',
  cleanUrls: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Blogs', link: '/ts-enum-byte' }
    ],

    sidebar: [
      {
        text: 'Blogs',
        items: [
          { text: '浅析TS枚举与位运算的结合', link: '/ts-enum-byte' },
          { text: 'Shader 入门与实践', link: '/shader' }
        ]
      }
    ],

    // socialLinks: [
    //   { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    // ]
  }
})
