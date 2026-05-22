import '@/styles/globals.css';
import '@/styles/flags.css';
import 'react-toastify/dist/ReactToastify.css';

import type { AppProps } from 'next/app';
import Head from 'next/head';
import {
  QueryClient,
  QueryClientProvider,
} from 'react-query';
import { ToastContainer } from 'react-toastify';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';

const queryClient = new QueryClient();

function createEmotionCache() {
  return createCache({ key: "css", prepend: true });
}

const clientSideEmotionCache = createEmotionCache();

export default function App({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}: AppProps & { emotionCache: any }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <CacheProvider value={emotionCache}>
        <QueryClientProvider client={queryClient}>
          <ToastContainer theme="light" />
          <Component {...pageProps} />{" "}
        </QueryClientProvider>
      </CacheProvider>
    </>
  );
}
