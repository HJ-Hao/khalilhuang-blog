---
title: Vue.js渲染器设计学习
date: 2025-11-29
---

Vue.js 作为一款构建用户界面的 JavaScript 框架，**渲染** 是其最核心的能力之一。本文会结合《Vue.js 设计与实现》第 7、8 章以及部分源码，一起梳理 Vue 渲染器的设计思路。

# 1. 什么是渲染器

从字面上看，渲染器就是“**负责渲染的那一层**”。在浏览器平台，它的职责就是把内容渲染成真实的 DOM 元素，让用户可以看到并与之交互。

先从一个极简的示例开始，下面这个函数就可以看作是一个“最朴素”的渲染器：它接收一段 HTML 字符串和一个容器节点，然后把内容直接塞进容器里。
```javascript
function renderer(dom, container) {
    container.innerHTML = dom;
}

renderer('<h1>count: 1</h1>', document.body)
```

在 Vue 中，渲染器要做的事情更“聪明”一些：**它不是直接渲染字符串，而是把虚拟 DOM 转换成真实 DOM 元素**。

虚拟 DOM（VNode）本质上是一个普通的 JavaScript 对象，它用数据结构的方式描述了真实 DOM 的结构，并通过一个个节点组成一棵树：
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

基于虚拟 DOM，渲染器的核心任务可以概括为两大类：

- **挂载（mount）**：把虚拟 DOM 渲染成真实 DOM，并挂载到容器中。
- **更新（patch）**：当虚拟 DOM 发生变化时，只对差异部分更新真实 DOM，这个过程叫做“打补丁（patch）”。

可以简单理解为：**第一次渲染做“挂载”，后续渲染做“打补丁”**，而这两种能力都集中在渲染器内部。

下面这段源码展示了 Vue 中渲染器的部分实现。可以先带着一个问题阅读：**为什么需要 `createRenderer`，不能直接导出一个简单的 `render` 函数就完了吗？**

> 渲染器是一个比“渲染函数”更宽泛的概念。它不仅负责渲染，还可以用来**激活已有的 DOM（hydrate）**，以及 **创建应用实例（createApp）**。换句话说，`render`、`hydrate`、`createApp` 等能力其实都属于同一个渲染器。

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

在上面的代码中我们已经看到，渲染器的入口是 `render` 函数，而真正“做事”的，是它内部调用的 `patch`。在 Vue 源码中，`patch` 会根据不同类型的 vnode 分发到不同的处理逻辑，比如普通元素、组件、文本、注释等。这里我们重点看**如何挂载 DOM 元素、如何处理属性和事件、以及它们的更新机制**。

## 2.1 挂载普通 DOM 元素：mountElement

当一个 vnode 的 `type` 是字符串（例如 `'div'`、`'span'`），说明它是一个普通的 DOM 元素节点，在 `patch` 内部最终会走到 `mountElement` 分支。简化后的实现大致如下：

```ts
function mountElement(vnode, container, anchor) {
  const { type, props, children } = vnode
  // 1. 创建真实 DOM 元素
  const el = hostCreateElement(type)
  vnode.el = el

  // 2. 处理元素属性和事件
  if (props) {
    for (const key in props) {
      hostPatchProp(el, key, null, props[key])
    }
  }

  // 3. 处理子节点
  if (typeof children === 'string') {
    hostSetElementText(el, children)
  } else if (Array.isArray(children)) {
    for (let i = 0; i < children.length; i++) {
      patch(null, children[i], el, null, null, null, null)
    }
  }

  // 4. 把元素插入到容器中
  hostInsert(el, container, anchor)
}
```

可以看到，挂载一个元素的过程可以拆解为四步：
- **创建元素**：通过 `hostCreateElement` 调用平台相关 API（浏览器中就是 `document.createElement`）。
- **设置属性/事件**：遍历 `props`，统一交给 `hostPatchProp` 处理。
- **处理子节点**：字符串子节点用 `hostSetElementText`，数组子节点则递归调用 `patch`。
- **插入容器**：最终通过 `hostInsert` 把元素插入到容器中对应的位置。

这几步都没有直接操作 DOM，而是通过前面提到的 `renderer options` 中传入的宿主 API（`hostCreateElement`、`hostSetElementText`、`hostInsert` 等）完成，从而实现跨平台。

## 2.2 统一的属性处理：patchProp

`mountElement` 中最关键的一行是：

```ts
hostPatchProp(el, key, null, props[key])
```

在浏览器平台下，`hostPatchProp` 就是对 `patchProp` 的封装。`patchProp` 的职责是**根据属性的不同类型，选择合适的更新策略**。简化后的逻辑大致如下：

```ts
function patchProp(el, key, prevValue, nextValue) {
  if (key === 'class') {
    // class 直接设置 className
    el.className = nextValue || ''
  } else if (key === 'style') {
    // style 是对象，需要一个个赋值/删除
    const style = el.style
    if (!nextValue) {
      el.removeAttribute('style')
    } else {
      for (const name in nextValue) {
        style[name] = nextValue[name]
      }
      if (prevValue) {
        for (const name in prevValue) {
          if (nextValue[name] == null) {
            style[name] = ''
          }
        }
      }
    }
  } else if (/^on[A-Z]/.test(key)) {
    // 事件处理（后文展开）
    patchEvent(el, key, prevValue, nextValue)
  } else {
    // 普通 DOM 属性 / 特性
    if (nextValue == null || nextValue === false) {
      el.removeAttribute(key)
    } else {
      el.setAttribute(key, nextValue)
    }
  }
}
```

这里有几个设计点值得注意：
- **class**：直接用 `className`，性能更好也更简单。
- **style**：统一用对象形式管理，便于 diff，能做到“新增/修改/删除”精细控制。
- **事件 onXxx**：不直接绑定/解绑，而是交给专门的 `patchEvent` 处理。
- **其他属性**：使用 `setAttribute/removeAttribute` 作为兜底策略，同时还会针对部分特殊属性做优化（如 `value`、`checked` 等）。

通过 `patchProp`，渲染器把“**我需要更新某个 key**”这个需求与“**如何在具体平台上更新这个 key**”解耦了。

## 2.3 事件处理：patchEvent 与伪造事件处理器

事件是更新最频繁、数量也可能最多的一类“属性”。如果每次更新都真的调用 `removeEventListener` / `addEventListener`，会带来较大的性能开销。Vue 源码中采用了一种**伪造事件处理器（invoker）**的方式来优化：

```ts
function patchEvent(el, rawName, prevValue, nextValue) {
  const invokers = el._vei || (el._vei = {})
  let invoker = invokers[rawName]
  const name = rawName.slice(2).toLowerCase() // onClick -> click

  if (nextValue && invoker) {
    // 已有 invoker，只需更新其 value
    invoker.value = nextValue
  } else {
    if (nextValue) {
      // 首次绑定：创建 invoker
      invoker = el._vei[rawName] = (e) => {
        // 统一在这里调用最新的事件回调
        if (Array.isArray(invoker.value)) {
          invoker.value.forEach(fn => fn(e))
        } else {
          invoker.value && invoker.value(e)
        }
      }
      invoker.value = nextValue
      el.addEventListener(name, invoker)
    } else if (invoker) {
      // 移除事件
      el.removeEventListener(name, invoker)
      invokers[rawName] = undefined
    }
  }
}
```

这样做有两个好处：
- **更新事件回调时不需要移除/重新绑定监听器**：只更新 `invoker.value` 即可。
- **支持数组形式的事件监听**：`onClick="[fn1, fn2]"`，通过在 invoker 内部遍历调用实现。

也就是说，对虚拟 DOM 层面来说，`onClick` 的变化只是一次普通的属性 diff，而真正的 DOM 事件监听只在首次绑定和完全移除时发生。

### 2.3.1 Vue 事件冒泡与更新时机

需要特别注意的是：**Vue 并没有“拦截”或“重写”浏览器的冒泡机制**。渲染到 DOM 上的其实就是一个原生事件监听器（上文的 `invoker`），因此：
- **冒泡路径仍然是原生 DOM 的事件传播路径**：从最内层目标元素开始，沿着父节点链路逐级向上，直到根节点。
- 如果你在某个元素上写 `@click.stop`，Vue 实际做的是在 `invoker` 内部调用 `event.stopPropagation()`，从而**在原生事件层面阻止冒泡**，并不是靠虚拟 DOM 自己“模拟”冒泡。

另一个常见问题是：**事件回调里修改响应式数据，它对应的 DOM 更新会在什么时候发生？**  
Vue 3 中采用了基于 `scheduler` 的异步更新策略，简单来说：
- 在事件回调中多次修改同一份 state，只会**合并成一次渲染更新**。
- 渲染更新不会在事件回调的同步栈中立刻执行，而是被推入一个队列，在**本轮事件和微任务执行完后统一刷新**（通常是微任务 / 下一次 tick）。

因此会出现这样的现象：
- 在同一个事件回调中，**你立刻读取 DOM，看到的还是旧的内容**（因为 patch 还没执行）。
- 如果使用 `nextTick` 等待一次 tick，再读取 DOM，才能看到更新后的结果。

总结一下事件相关的关键点：
- **冒泡完全遵循原生 DOM 规则**，`.stop`、`.capture` 等都是通过对原生事件对象的操作实现。
- **事件监听的更新是“逻辑更新”，不是频繁解绑/重绑**，只更新 `invoker.value`。
- **响应式数据更新到 DOM 是异步批量完成的**：事件回调只是触发了更新调度，真正的 DOM patch 会在本轮任务结束后统一执行。

## 2.4 更新属性：patchElement 与 props diff

当同一个 vnode 对应的元素已经挂载在页面上，再次渲染时就会走“打补丁”的逻辑，对于普通元素来说会进入 `patchElement`：

```ts
function patchElement(n1, n2) {
  const el = (n2.el = n1.el)
  const oldProps = n1.props || {}
  const newProps = n2.props || {}

  // 1. 更新/新增属性
  for (const key in newProps) {
    const prev = oldProps[key]
    const next = newProps[key]
    if (prev !== next) {
      hostPatchProp(el, key, prev, next)
    }
  }

  // 2. 删除多余属性
  for (const key in oldProps) {
    if (!(key in newProps)) {
      hostPatchProp(el, key, oldProps[key], null)
    }
  }

  // 3. 更新子节点（略去细节，实际上还有一套专门的 children diff）
  patchChildren(n1, n2, el)
}
```

这里体现了 Vue 渲染器在**属性更新**上的几个关键点：
- **按 key 逐一比较**：只对发生变化的属性调用 `patchProp`。
- **统一入口 `hostPatchProp`**：无论是 class、style、事件还是普通 DOM 属性，更新路径都是一致的。
- **删除旧属性**：对于旧 props 中有但新 props 中没有的 key，会把新值视为 `null` 交给 `patchProp` 处理，从而移除对应的 DOM 状态。

结合前文的 `mountElement` 可以看到，Vue 在“挂载”和“更新”两个阶段都复用了同一套属性处理逻辑（`patchProp`），只是在“首次挂载”时旧值统一为 `null`，在“更新阶段”则有真实的旧值用于 diff，这样既减少了重复代码，也让行为保持一致。

后续如果你再结合源码中的 `patchChildren`（处理文本子节点、数组子节点、keyed diff 等），就能够把“一个 vnode 从无到有，再到不断更新”的全流程串起来，从而完整理解 Vue 渲染器的核心设计。