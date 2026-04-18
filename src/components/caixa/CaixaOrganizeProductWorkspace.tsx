"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Category, Product } from "@/types/database";

const pid = (id: string) => `p:${id}`;
const cidTop = (id: string) => `droptop-${id}`;
const cidBot = (id: string) => `dropbot-${id}`;

function parseCategoryDropId(oid: string): string | null {
  if (oid.startsWith("droptop-")) return oid.slice("droptop-".length);
  if (oid.startsWith("dropbot-")) return oid.slice("dropbot-".length);
  return null;
}

function CategoryDropChip({
  category,
  emoji,
  name,
  placement,
}: {
  category: Category;
  emoji: string;
  name: string;
  placement: "top" | "bottom";
}) {
  const dropId = placement === "top" ? cidTop(category.id) : cidBot(category.id);
  const { isOver, setNodeRef } = useDroppable({ id: dropId });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[5.5rem] w-[6.75rem] shrink-0 flex-col items-center justify-center rounded-2xl border-2 bg-white px-2 py-2 text-center shadow-sm transition ${
        isOver ? "scale-[1.04] border-violet-600 ring-2 ring-violet-400 ring-offset-2" : "border-violet-200"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span className="mt-1 line-clamp-2 text-[11px] font-semibold leading-tight text-slate-800">{name}</span>
    </div>
  );
}

function SortableProductCard({
  product,
  formatBRL,
}: {
  product: Product;
  formatBRL: (n: number) => string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pid(product.id),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-violet-300/90 bg-violet-50/50 p-3 text-center shadow-sm outline-none ring-violet-400 focus-visible:ring-2"
      {...attributes}
      {...listeners}
    >
      <span className="pointer-events-none text-3xl" aria-hidden>
        {product.icon ?? "📦"}
      </span>
      <span className="pointer-events-none text-sm font-semibold text-slate-800">{product.name}</span>
      {product.type === "quantity" ? (
        <span className="pointer-events-none text-xs text-slate-500">{formatBRL(product.price)} / un.</span>
      ) : product.type === "typed_value" ? (
        <span className="pointer-events-none text-xs text-slate-500">
          {product.price > 0 ? `Ref. ${formatBRL(product.price)}` : "Digite o valor"}
        </span>
      ) : product.price > 0 ? (
        <span className="pointer-events-none text-xs text-slate-500">Ref. {formatBRL(product.price)}</span>
      ) : (
        <span className="pointer-events-none text-xs text-slate-500">Valor manual</span>
      )}
      <span className="pointer-events-none text-[10px] font-medium text-violet-800/90">Arrastar</span>
    </div>
  );
}

function ProductDragPreview({ product }: { product: Product }) {
  return (
    <div className="flex min-h-28 min-w-[8rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-violet-500 bg-white p-3 text-center shadow-xl">
      <span className="text-3xl" aria-hidden>
        {product.icon ?? "📦"}
      </span>
      <span className="text-sm font-semibold text-slate-800">{product.name}</span>
      <span className="text-xs text-violet-700">Mover para…</span>
    </div>
  );
}

export type CaixaOrganizeProductWorkspaceProps = {
  categories: Category[];
  products: Product[];
  onReorderProducts: (orderedIds: string[]) => void;
  onMoveProductToCategory: (productId: string, categoryId: string) => Promise<void>;
  onAddProduct: () => void;
  categoryDisplayIcon: (c: Category) => string;
  formatBRL: (n: number) => string;
  novoProductButtonClassName: string;
};

export function CaixaOrganizeProductWorkspace({
  categories,
  products,
  onReorderProducts,
  onMoveProductToCategory,
  onAddProduct,
  categoryDisplayIcon,
  formatBRL,
  novoProductButtonClassName,
}: CaixaOrganizeProductWorkspaceProps) {
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const sortableIds = useMemo(() => products.map((p) => pid(p.id)), [products]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (!id.startsWith("p:")) return;
    const raw = id.slice(2);
    setActiveProduct(productById.get(raw) ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveProduct(null);
    if (!over) return;

    const aid = String(active.id);
    if (!aid.startsWith("p:")) return;
    const productId = aid.slice(2);

    const oid = String(over.id);

    const categoryDrop = parseCategoryDropId(oid);
    if (categoryDrop) {
      await onMoveProductToCategory(productId, categoryDrop);
      return;
    }

    if (oid.startsWith("p:")) {
      const overProductId = oid.slice(2);
      if (productId === overProductId) return;
      const ids = products.map((p) => p.id);
      const oldIndex = ids.indexOf(productId);
      const newIndex = ids.indexOf(overProductId);
      if (oldIndex === -1 || newIndex === -1) return;
      onReorderProducts(arrayMove(ids, oldIndex, newIndex));
    }
  };

  const handleDragCancel = () => {
    setActiveProduct(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={(ev) => void handleDragEnd(ev)}
      onDragCancel={handleDragCancel}
    >
      {activeProduct ? (
        <div className="sticky top-0 z-30 mb-3 rounded-xl border-2 border-violet-300 bg-violet-50/98 px-3 py-3 shadow-lg backdrop-blur-sm">
          <p className="mb-2 text-center text-xs font-semibold text-violet-900">Solte em uma categoria</p>
          <div className="flex flex-nowrap justify-center gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <CategoryDropChip
                key={c.id}
                category={c}
                emoji={categoryDisplayIcon(c)}
                name={c.name}
                placement="top"
              />
            ))}
          </div>
        </div>
      ) : null}

      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div
          className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${activeProduct ? "pb-44" : ""}`}
        >
          {products.map((p) => (
            <SortableProductCard key={p.id} product={p} formatBRL={formatBRL} />
          ))}
          <button type="button" onClick={onAddProduct} className={novoProductButtonClassName}>
            <span className="text-3xl text-emerald-700" aria-hidden>
              ＋
            </span>
            <span className="text-sm font-semibold text-emerald-900">Novo produto</span>
          </button>
        </div>
      </SortableContext>

      {activeProduct ? (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] border-t-2 border-violet-300 bg-violet-50/98 px-3 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] backdrop-blur-md lg:inset-auto lg:bottom-6 lg:right-6 lg:w-full lg:max-w-xl lg:rounded-2xl lg:border lg:shadow-xl"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <p className="mb-2 text-center text-xs font-semibold text-violet-900">Categorias — solte aqui</p>
          <div className="flex flex-nowrap justify-center gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <CategoryDropChip
                key={`bot-${c.id}`}
                category={c}
                emoji={categoryDisplayIcon(c)}
                name={c.name}
                placement="bottom"
              />
            ))}
          </div>
        </div>
      ) : null}

      <DragOverlay dropAnimation={null}>
        {activeProduct ? <ProductDragPreview product={activeProduct} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
