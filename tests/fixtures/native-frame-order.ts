// Page 8: canvas coordinates read from Figma; all six native PDF pages were
// verified as 595 x 842. Input follows page.children (bottom of Layers first).
// Expected order was confirmed by the user from Figma's native PDF on 2026-09-10.
export const nativeFrames = [
  { id: '39', name: 'A4 - 39', x: 1260, y: 1316, width: 595, height: 842 },
  { id: '40', name: 'A4 - 40', x: 815, y: 243, width: 595, height: 842 },
  { id: '41', name: 'A4 - 41', x: 3352, y: 122, width: 595, height: 842 },
  { id: '42', name: 'A4 - 42', x: 1891, y: 2, width: 595, height: 842 },
  { id: '43', name: 'A4 - 43', x: -289, y: -599, width: 595, height: 842 },
  { id: '44', name: 'A4 - 44', x: 2558, y: 664, width: 595, height: 842 },
]

export const nativeOrder = ['43', '40', '42', '41', '39', '44']
