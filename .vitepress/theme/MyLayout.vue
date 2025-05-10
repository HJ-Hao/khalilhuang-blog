<script setup>
import DefaultTheme from 'vitepress/theme'
import { data as posts } from './posts.data.ts'


const { Layout } = DefaultTheme

// 按年份和月份分组
const groups = {};
    
posts.forEach(post => {
  const date = new Date(post.date.time);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 月份从0开始，所以+1
  
  const key = `${year}-${month.toString().padStart(2, '0')}`;
  
  if (!groups[key]) {
    groups[key] = {
      year,
      month,
      posts: []
    };
  }
  
  groups[key].posts.push(post);
});

// 将对象转换为数组并按年份和月份倒序排序
Object.values(groups).sort((a, b) => {
  if (a.year !== b.year) {
    return b.year - a.year;
  }
  return b.month - a.month;
});

</script>

<template>
  <Layout>
    <template #home-features-after>
      <div class="post-container">
        <div v-for="group in groups" :key="`${group.year}-${group.month}`" class="post-group">
          <h2>{{ group.year }}/{{ group.month }}</h2>
          <div v-for="post in group.posts" :key="post.id" class="post-item">
            <a :href="post.url">
              <h3>
                {{ post.title }}
              </h3>
            </a>
          </div>
        </div>
      </div>
    </template>
  </Layout>
</template>