---
title: Vue.js渲染器设计学习
date: 2025-11-29
---

Vue.js作为一款构建用户界面的javascript框架，渲染是其核心功能。接下来通过《Vue.js设计与实现》的第7章，第8章及源码内容，学习下Vue.js是如何设计渲染器的。

# 1. 什么是渲染器
顾名思义，渲染器就是用来执行渲染任务的。在浏览器平台，通过它去渲染DOM元素。
下面这个函数就是一个简易的渲染器。执行下面这段函数就可以将静态内容渲染到网页中。
```javascript
function renderer(dom, container) {
    container.innerHTML = dom;
}

renderer('<h1>count: 1</h1>', document.body)
```
在vue中的渲染器是将虚拟dom转换成真实dom元素。虚拟dom是一个普通的JS对象，它和真实dom结构一致，由一个个节点构成一个完整的树型结构。 
```JS
const vnode = {
    type: 'div',
    children: [
        {
            type: 'p',
            children: 'hello'
        }
    ]
}
```

渲染器主要需要处理两种操作：
- 挂载(mount)：将虚拟DOM渲染为真实DOM并挂载到容器中
- 更新(（patch）)：当虚拟DOM发生变化时，需要更新真实DOM，这个过程叫做"打补丁"（patch）

下面就是vue源码中关于渲染器的实现部分。可以思考下为什么会需要createRenderer,可以直接定义render吗？
> 渲染器是更加宽泛的概念，它包含渲染。渲染器不仅可以用来渲染，还可以用来激活已有的 DOM 元素。实际上除了render,还有hydrate及createApp都是渲染器函数的一部分
```typescript
export function createRenderer<
  HostNode = RendererNode,
  HostElement = RendererElement,
>(options: RendererOptions<HostNode, HostElement>): Renderer<HostElement> {
  return baseCreateRenderer<HostNode, HostElement>(options)
}

function baseCreateRenderer(
  options: RendererOptions,
  createHydrationFns?: typeof createHydrationFunctions,
): any {
    // 省略代码
    const render = (vnode, container, namespace) => {
        if (vnode == null) {
            if (container._vnode) {
                // 旧vnode存在，且新vnode不存在，说明需要卸载
                // 清空container中的DOM
                unmount(container._vnode, null, null, true)
            }
        } else {
            // 新vnode存在, 将旧vnode一起传给patch函数，进行打补丁
            // 这里实现上将挂载也看作是一次特殊的补丁操作
            patch(
                // 第一个参数n1, 代表旧的Vnode节点
                container._vnode || null,
                // 第二个参数n2, 代表新的Vnode节点
                vnode,
                // 第三个参数container: 挂载节点的容器
                container,
                null,
                null,
                null,
                namespace,
            )
        }
        // 将当前vnode存储在container._vnode下，作为后续渲染的旧vnode
        container._vnode = vnode;
        //...
    };

    return {
        // ...
        render;
    };
} 
```
上面给出了render函数的基本实现，接下来配合下面的代码分析其执行流程，能帮助我们更好地理解render函数地实现。假设进行3次渲染
```typescript
const renderer = createRenderer()
const container = document.querySelector('#app');

// 首次渲染
renderer.render(vnode1, container)
// 第二次渲染
renderer.render(vnode2, container)
// 第三次渲染
renderer.render(null, container)
```
1. 在首次渲染时，渲染器会将 vnode1 渲染为真实 DOM。渲染完成后，vnode1 会存储到容器元素的 container._vnode 属性中，它会在后续渲染中作为旧 vnode 使用。
2. 在第二次渲染时，旧 vnode 存在，此时渲染器会把 vnode2 作为新vnode，并将新旧 vnode 一同传递给 patch 函数进行打补丁。
3. 在第三次渲染时，新 vnode 的值为 null，即什么都不渲染。但此时容器中渲染的是 vnode2 所描述的内容，所以渲染器需要清空容器，调用unmount函数。

另外vue的渲染器不仅仅能把虚拟dom渲染成浏览器平台上的真实dom，而是通过配置的方式将平台渲染API进行抽象以此实现跨平台能力，这个就是创建渲染器时options参数的作用了，下面就是Vue对于options对象的类型定义。
```TS
export interface RendererOptions<
  HostNode = RendererNode,
  HostElement = RendererElement,
> {
  patchProp(
    el: HostElement,
    key: string,
    prevValue: any,
    nextValue: any,
    namespace?: ElementNamespace,
    parentComponent?: ComponentInternalInstance | null,
  ): void
  insert(el: HostNode, parent: HostElement, anchor?: HostNode | null): void
  remove(el: HostNode): void
  createElement(
    type: string,
    namespace?: ElementNamespace,
    isCustomizedBuiltIn?: string,
    vnodeProps?: (VNodeProps & { [key: string]: any }) | null,
  ): HostElement
  createText(text: string): HostNode
  createComment(text: string): HostNode
  setText(node: HostNode, text: string): void
  setElementText(node: HostElement, text: string): void
  parentNode(node: HostNode): HostElement | null
  nextSibling(node: HostNode): HostNode | null
  querySelector?(selector: string): HostElement | null
  setScopeId?(el: HostElement, id: string): void
  cloneNode?(node: HostNode): HostNode
  insertStaticContent?(
    content: string,
    parent: HostElement,
    anchor: HostNode | null,
    namespace: ElementNamespace,
    start?: HostNode | null,
    end?: HostNode | null,
  ): [HostNode, HostNode]
}
```
对于浏览器平台，它的renderer options就是对dom api的封装，源码如下
```ts
// core\packages\runtime-dom\src\nodeOps.ts
const doc = (typeof document !== 'undefined' ? document : null) as Document

export const nodeOps = {
    // 省略部分api
    insert: (child, parent, anchor) => {
        parent.insertBefore(child, anchor || null)
    },

    createElement: (tag, namespace, is, props): Element => {
        const el = doc.createElement(tag)
        return el
    },

    setElementText: (el, text) => {
        el.textContent = text
    },
}
```
在渲染器内，得到操作dom元素的api,在作用域内定义的函数patch，render都可以访问到这些api。
```TS
function baseCreateRenderer(options) {
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent,
  } = options
  // ...
  function patch () {

  }

  function mountElement () {

  }
}
```

# 2. 渲染器的核心

// todo