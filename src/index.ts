/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import { promisify } from 'util';
import { Plugin, ExistingRawSourceMap } from 'rollup';
import pluginUtils, { CreateFilter } from '@rollup/pluginutils';
import sourceMapResolve from 'source-map-resolve';

const { createFilter } = pluginUtils;
const { resolveSourceMap, resolveSources } = sourceMapResolve;

const promisifiedResolveSourceMap = promisify(resolveSourceMap);
const promisifiedResolveSources = promisify(resolveSources);

export interface SourcemapsPluginOptions {
  include?: Parameters<CreateFilter>[0];
  exclude?: Parameters<CreateFilter>[1];
  readFile?(path: string, callback: (error: Error | null, data: Buffer | string) => void): void;
}

export default function sourcemaps({
  include,
  exclude,
  readFile = fs.readFile,
}: SourcemapsPluginOptions = {}): Plugin {
  const filter = createFilter(include, exclude);
  const promisifiedReadFile = promisify(readFile);

  return {
    name: 'sourcemaps',

    async load(rawId: string) {
      const id = rawId.replace(/\?.+$/, '');

      if (!filter(id)) {
        return null;
      }

      let code: string;
      try {
        code = (await promisifiedReadFile(id)).toString();
      } catch (ex: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        this.warn(`Failed reading file ${JSON.stringify(ex)}`);
        return null;
      }

      let map: ExistingRawSourceMap;
      try {
        const result = await promisifiedResolveSourceMap(code, id, readFile);

        // The code contained no sourceMappingURL
        if (result === null) {
          return { code };
        }

        map = result.map;
      } catch (ex: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        this.warn(`Failed resolving source map ${JSON.stringify(ex)}`);
        return { code };
      }

      // Resolve sources if they're not included
      if (map.sourcesContent === undefined) {
        try {
          const { sourcesContent } = await promisifiedResolveSources(map, id, readFile);
          if (sourcesContent.every(item => typeof item === 'string')) {
            map.sourcesContent = sourcesContent as string[];
          }
        } catch (ex: any) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          this.warn(`Failed resolving sources for source map ${JSON.stringify(ex)}`);
        }
      }

      return { code, map };
    },
  };
}
