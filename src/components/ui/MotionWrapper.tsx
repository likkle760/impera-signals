"use client";

import { motion } from "framer-motion";

/* Lightweight passthrough motion element components for premium page
   composition. Each accepts framer-motion props. */

export const MotionDiv = (props: React.ComponentProps<typeof motion.div>) => <motion.div {...props} />;
export const MotionSection = (props: React.ComponentProps<typeof motion.section>) => <motion.section {...props} />;
export const MotionSpan = (props: React.ComponentProps<typeof motion.span>) => <motion.span {...props} />;
export const MotionButton = (props: React.ComponentProps<typeof motion.button>) => <motion.button {...props} />;
export const MotionArticle = (props: React.ComponentProps<typeof motion.article>) => <motion.article {...props} />;
export const MotionMain = (props: React.ComponentProps<typeof motion.main>) => <motion.main {...props} />;
export const MotionAside = (props: React.ComponentProps<typeof motion.aside>) => <motion.aside {...props} />;
export const MotionHeader = (props: React.ComponentProps<typeof motion.header>) => <motion.header {...props} />;
export const MotionFooter = (props: React.ComponentProps<typeof motion.footer>) => <motion.footer {...props} />;
export const MotionNav = (props: React.ComponentProps<typeof motion.nav>) => <motion.nav {...props} />;
export const MotionUl = (props: React.ComponentProps<typeof motion.ul>) => <motion.ul {...props} />;
export const MotionLi = (props: React.ComponentProps<typeof motion.li>) => <motion.li {...props} />;
