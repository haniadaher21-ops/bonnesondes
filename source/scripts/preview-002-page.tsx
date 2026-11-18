import type { Metadata } from 'next';
import Journal from '../app/journal';
import { catalog, issues, type Edition } from '../app/content';
import draftJson from '../editorial/drafts/002-selection.json';
import { validateEdition } from '../editorial/edition.mjs';

export const metadata: Metadata = {
  title: 'Bonnes Ondes — Aperçu de l’édition 002',
  robots: { index: false, follow: false },
};

export default function Preview() {
  const errors = validateEdition(draftJson, issues.filter(edition => edition.number < '002'), catalog);
  if (draftJson.number !== '002' || errors.length) {
    throw new Error(['Brouillon 002 invalide.', ...errors].join('\n'));
  }

  const draft = draftJson as Omit<Edition, 'featured'> & { featuredId: string };
  const featured = draft.mixes.find(item => item.id === draft.featuredId)!;
  return <Journal preview={{ edition: { ...draft, featured }, basePath: '/bonnesondes/preview-002' }} />;
}
