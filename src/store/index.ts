import { create } from 'zustand'

interface AppState {
  searchQuery: string
  selectedDimension: string | null
  setSearchQuery: (q: string) => void
  setSelectedDimension: (d: string | null) => void
}

export const useStore = create<AppState>((set) => ({
  searchQuery: '',
  selectedDimension: null,
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedDimension: (d) => set({ selectedDimension: d }),
}))
