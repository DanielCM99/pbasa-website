export const SITE_URL = 'https://pbasa.org';
export const SITE_NAME = 'Palm Beach Academy of Sports and Arts';
export const SITE_SHORT_NAME = 'PBASA';
export const SITE_DESCRIPTION =
  'Palm Beach Academy of Sports and Arts is a tuition-free K-8 public charter school in West Palm Beach, Florida, empowering every student through classical academics, the arts, and athletics.';
export const DEFAULT_OG_IMAGE = '/images/school-image.png';
export const CONTACT_EMAIL = 'contact@pbasa.org';
export const EMPLOYMENT_EMAIL = 'employment@pbasa.org';

/**
 * Site-wide JSON-LD graph. Kept in one place so the Organization identity
 * agents read stays consistent across every page.
 */
export function buildJsonLd({ url, title, description }: { url: string; title: string; description: string }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['School', 'Organization'],
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        alternateName: SITE_SHORT_NAME,
        url: `${SITE_URL}/`,
        description: SITE_DESCRIPTION,
        slogan: 'Where Potential Becomes Purpose',
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/images/logo.png`,
        },
        image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
        email: CONTACT_EMAIL,
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'West Palm Beach',
          addressRegion: 'FL',
          addressCountry: 'US',
        },
        areaServed: {
          '@type': 'AdministrativeArea',
          name: 'Palm Beach County, Florida',
        },
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'admissions',
            email: CONTACT_EMAIL,
            availableLanguage: ['English'],
            url: `${SITE_URL}/enrollment/`,
          },
          {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: CONTACT_EMAIL,
            availableLanguage: ['English'],
            url: `${SITE_URL}/contact/`,
          },
          {
            '@type': 'ContactPoint',
            contactType: 'human resources',
            email: EMPLOYMENT_EMAIL,
            availableLanguage: ['English'],
          },
        ],
        isAccessibleForFree: true,
        keywords: 'charter school, K-8, West Palm Beach, classical academics, arts, athletics, tuition-free',
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: 'en-US',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: title,
        description,
        inLanguage: 'en-US',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };
}
