# BlockFull focus 无限循环修复

**日期**：2026-04-22
**文件**：`frontend/app/block/block.tsx`
**症状**：启动后 React 抛 `Maximum update depth exceeded`（`block.tsx:114` `setBlockClicked(isFocused)`），ErrorBoundary 接住，页面白屏。Console 里大量
```
setFocusedChild <blockId> input.termblocks-input
focusedChild focus <blockId>
```
在两个/多个 block 之间来回打印。

## 根因

三个 bug 叠加触发：

1. **handleChildFocus 无条件调 `nodeModel.focusNode()`**
   上游提交把 `if (!isFocused) focusNode()` 的守卫删了。termblocks input 在挂载时 auto-focus，多个 block 的 input 互相抢焦点，每次 onFocus 都调用 focusNode，让 layout model 的 `focusedNodeId` 在几个 node 间来回跳。

2. **useCallback 闭包里的 `isFocused` 是过期值**
   即便还原守卫 `if (!isFocused)`，DOM focus 事件在同一个 React tick 内同步连续触发，React 还没来得及重渲染刷新 closure。handleChildFocus 捕获的 `isFocused` 仍是上一轮的值，守卫被绕过。

3. **第一个 `useLayoutEffect` 用 `setBlockClicked(isFocused)` 做中转**
   ```ts
   useLayoutEffect(() => {
       setBlockClicked(isFocused);
   }, [isFocused]);
   ```
   `isFocused` 振荡 → 每次都 setState → 触发 re-render → 再次读到振荡的 `isFocused` → 再 setState。React 25 层后抛 Max update depth。

额外：`TermBlocksInput` 里新加的 `useEffect(() => inputRef.current?.focus(), [])` 加剧了挂载期抢焦点。

## 修复

### 1. handleChildFocus 读 atom 当场值，不用闭包

```ts
const handleChildFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement, Element>) => {
        if (globalStore.get(nodeModel.isFocused)) {
            return;
        }
        nodeModel.focusNode();
    },
    [nodeModel]
);
```

`globalStore.get()` 读 atom 的**当前值**，绕过 React 闭包快照。`nodeModel` 稳定，callback 不再随 `isFocused` 重新生成。

### 2. 第二个 useLayoutEffect 的守卫同样改成读 atom

```ts
if (!globalStore.get(nodeModel.isFocused)) {
    nodeModel.focusNode();
}
```

### 3. 第一个 useLayoutEffect 彻底去掉 setState，只做 DOM focus

```ts
useLayoutEffect(() => {
    if (!isFocused) {
        return;
    }
    const focusWithin = focusedBlockId() == nodeModel.blockId;
    if (!focusWithin) {
        setFocusTarget();
    }
}, [isFocused, nodeModel]);
```

`blockClicked` 状态不再由 `isFocused` 变化驱动，只由用户点击（`setBlockClickedTrue`）触发。第一个 effect 现在**零 setState**，从根本上不可能造成 React update-depth 循环。

## 教训

- **Jotai 派生 atom 的读取在事件处理里要当场读**，不要依赖 useCallback 闭包的 props，特别是 DOM 同步事件可能在一个 tick 内连续触发的场景。
- **useLayoutEffect 里用 setState 做中转容易出循环**。如果可以直接做 side effect（DOM 操作），就不要经 useState。
- **删守卫代码时要想清楚守卫在挡什么**。这次删掉 `if (!isFocused)` 直接把本来互斥的焦点流变成了环。

## 相关 commit / 改动

- `frontend/app/block/block.tsx` — 3 处守卫改为 `globalStore.get(nodeModel.isFocused)`；第一个 layout effect 去掉 setState
- 新增 import：`import { globalStore } from "@/app/store/jotaiStore"`

## 复现条件（修复前）

多 block workspace（本次 3 block 最稳定触发），任一 block 为 termblocks 视图，启动时 TermBlocksInput 的 auto-focus `useEffect` 和 BlockFull 的 focus pipeline 会竞争。
