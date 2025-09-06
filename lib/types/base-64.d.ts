// types/base-64.d.ts
declare module 'base-64' {
  /** Base64 -> 文字列（バイナリは 8bit 文字列として返る） */
  export function decode(input: string): string;
  /** 文字列 -> Base64 */
  export function encode(input: string): string;
}
