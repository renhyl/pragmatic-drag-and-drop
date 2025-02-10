import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import mergeRefs from '@atlaskit/ds-lib/merge-refs'
import { triggerPostMoveFlash } from '@atlaskit/pragmatic-drag-and-drop-flourish/trigger-post-move-flash'
import { attachClosestEdge, type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index'
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { reorder } from '@atlaskit/pragmatic-drag-and-drop/reorder'

type CleanupFn = () => void

type ItemEntry = { itemId: string; element: HTMLElement }

type ListContextValue = {
    listLength: number
    registerItem: (entry: ItemEntry) => CleanupFn
    reorderItem: (args: { startIndex: number; indexOfTarget: number; closestEdgeOfTarget: Edge | null }) => void
    instanceId: symbol
}

const ListContext = createContext<ListContextValue | null>(null)

function useListContext() {
    const listContext = useContext(ListContext)
    if (listContext === null) throw new Error("ListContext can't be null")
    return listContext
}

type Item = {
    id: string
    label: string
}

type ItemData = {
    item: Item
    index: number
    instanceId: symbol
}

function isItemData(data: Record<string | symbol, unknown>): data is ItemData {
    return data?.item !== undefined && data?.index !== undefined && data?.instanceId !== undefined
}

function ListItem({ item, index }: { item: Item; index: number }) {
    const { registerItem, instanceId } = useListContext()
    const [closestEdge, setClosestEdge] = useState<Edge | null>(null)
    const ref = useRef<HTMLDivElement>(null)
    const dragHandleRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const element = ref.current
        const dragHandle = dragHandleRef.current
        if (!element || !dragHandle) return

        const data = { item, index, instanceId }

        return combine(
            registerItem({ itemId: item.id, element }),
            draggable({
                element: dragHandle,
                getInitialData: () => data
            }),
            dropTargetForElements({
                element,
                canDrop({ source }) {
                    return isItemData(source.data) && source.data.instanceId === instanceId
                },
                getData({ input }) {
                    return attachClosestEdge(data, {
                        element,
                        input,
                        allowedEdges: ['top', 'bottom']
                    })
                },
                onDrag({ self, source }) {
                    const isSource = source.element === element
                    if (isSource) {
                        setClosestEdge(null)
                        return
                    }

                    const closestEdge = extractClosestEdge(self.data)
                    setClosestEdge(closestEdge)
                },
                onDragLeave() {
                    setClosestEdge(null)
                },
                onDrop() {
                    setClosestEdge(null)
                }
            })
        )
    }, [instanceId, item, index, registerItem])

    return (
        <div ref={ref}>
            {closestEdge && closestEdge === 'top' && <div className="border-t"></div>}
            <div ref={mergeRefs([dragHandleRef])}>{item.label}</div>
            {closestEdge && closestEdge === 'bottom' && <div className="border-b"></div>}
        </div>
    )
}

const defaultItems: Item[] = [
    {
        id: 'task-1',
        label: 'Organize a team-building event'
    },
    {
        id: 'task-2',
        label: 'Create and maintain office inventory'
    },
    {
        id: 'task-3',
        label: 'Update company website content'
    }
]

function getItemRegistry() {
    const registry = new Map<string, HTMLElement>()

    function register({ itemId, element }: ItemEntry) {
        registry.set(itemId, element)

        return function unregister() {
            registry.delete(itemId)
        }
    }

    function getElement(itemId: string): HTMLElement | null {
        return registry.get(itemId) ?? null
    }

    return { register, getElement }
}

type ListState = {
    items: Item[]
    lastMoved: {
        item: Item
    } | null
}

export default function ListExample() {
    const [{ items, lastMoved }, setListState] = useState<ListState>({
        items: defaultItems,
        lastMoved: null
    })

    const registry = getItemRegistry()

    // Isolated instances of this component from one another
    const [instanceId] = useState(() => Symbol('instance-id'))

    const reorderItem = useCallback(
        ({
            startIndex,
            indexOfTarget,
            closestEdgeOfTarget
        }: {
            startIndex: number
            indexOfTarget: number
            closestEdgeOfTarget: Edge | null
        }) => {
            const finishIndex = getReorderDestinationIndex({
                startIndex,
                closestEdgeOfTarget,
                indexOfTarget,
                axis: 'vertical'
            })

            if (finishIndex === startIndex) {
                // If there would be no change, we skip the update
                return
            }

            setListState((listState) => {
                const item = listState.items[startIndex]

                return {
                    items: reorder({
                        list: listState.items,
                        startIndex,
                        finishIndex
                    }),
                    lastMoved: {
                        item
                    }
                }
            })
        },
        []
    )

    useEffect(() => {
        return monitorForElements({
            canMonitor({ source }) {
                return isItemData(source.data) && source.data.instanceId === instanceId
            },
            onDrop({ location, source }) {
                const target = location.current.dropTargets[0]
                if (!target) {
                    return
                }

                const sourceData = source.data
                const targetData = target.data
                if (!isItemData(sourceData) || !isItemData(targetData)) {
                    return
                }

                const indexOfTarget = items.findIndex((item) => item.id === targetData.item.id)
                if (indexOfTarget < 0) {
                    return
                }

                reorderItem({
                    startIndex: sourceData.index,
                    indexOfTarget,
                    closestEdgeOfTarget: extractClosestEdge(targetData)
                })
            }
        })
    }, [instanceId, items, reorderItem])

    // once a drag is finished, we have some post drop actions to take
    useEffect(() => {
        if (lastMoved === null) {
            return
        }

        const { item } = lastMoved
        const element = registry.getElement(item.id)
        if (element) triggerPostMoveFlash(element)
    }, [lastMoved, registry])

    const contextValue: ListContextValue = useMemo(() => {
        return {
            registerItem: registry.register,
            reorderItem,
            instanceId,
            listLength: items.length
        }
    }, [registry.register, reorderItem, instanceId, items.length])

    return (
        <ListContext.Provider value={contextValue}>
            {items.map((item, index) => (
                <ListItem key={item.id} item={item} index={index} />
            ))}
        </ListContext.Provider>
    )
}
