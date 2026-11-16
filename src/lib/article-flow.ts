import type { ArticleElement } from './article-layout.ts';
/**
 * Garde une image ou une bulle à côté du texte qu'elle accompagne.
 *
 * Dans un article, une illustration flottante peut se retrouver séparée de
 * son paragraphe quand l'écran rétrécit. L'option `keepWithNext` d'un élément
 * (`article-layout.ts`) demande de le garder groupé avec ce qui suit. Ce
 * regroupement sert à la fois à l'éditeur et au rendu public, pour que
 * l'aperçu et la page en ligne soient identiques.
 */

type FlowBlock = { element?: ArticleElement; type?: string; editable?: boolean; source?: string };
export type ArticleFlow<T> = { items: T[]; grouped: boolean };

/**
 * Rassemble chaque élément marqué « garder avec la suite » et le bloc qui le
 * suit. Le rattachement s'arrête au premier bloc de texte, et ne traverse
 * jamais un titre, un tableau ou du code.
 */
export function groupArticleFlow<T extends FlowBlock>(blocks: T[]): ArticleFlow<T>[] {
	const result: ArticleFlow<T>[] = [];
	for (let index = 0; index < blocks.length; index++) {
		const items = [blocks[index]];
		while (items.at(-1)?.element?.keepWithNext && index + 1 < blocks.length) {
			const next = blocks[index + 1];
			const text = next.type
				? ['paragraph_open', 'bullet_list_open', 'ordered_list_open', 'blockquote_open'].includes(next.type)
				: next.editable && !/^#{1,6}\s/.test(next.source ?? '');
			if (!next.element && !text) break;
			items.push(next);
			index++;
		}
		result.push({ items, grouped: items.length > 1 });
	}
	return result;
}

export function articleFlowClass(items: FlowBlock[]): string {
	if (items.every((item) => item.element))
		return (
			'article-flow article-flow-objects' +
			(items.every((item) => item.element?.kind === 'bubble') && items[0].element?.dialogueLayout === 'staggered'
				? ' article-flow-staggered'
				: '')
		);
	return `article-flow article-flow-${items[0].element?.align ?? 'left'}`;
}
