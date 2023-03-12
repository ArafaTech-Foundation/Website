import CoursesLayout from "@components/courses/layout";
import { getFolderContents } from "@pages/api/courses/folder";
import { getRepositoryFolders } from "@pages/api/courses/repository";
import axios from "axios";
import clsx from "clsx";
import { imageUrl } from "config";
import matter from "gray-matter";
import { MDXRemote, MDXRemoteProps } from "next-mdx-remote";
import { serialize } from "next-mdx-remote/serialize";
import Head from "next/head";
import Link from "next/link";
import Prism from "prismjs";
import { CourseMeta, CourseModule, Matter } from "types";

type Course = {
	source: MDXRemoteProps;
	meta: CourseMeta;
	matter: Matter; // TODO: add matter type
	page: string;
};

export default function CoursePage({ source, meta, matter, page }: Course) {
	const lessonVideo = meta.modules
		.flatMap((module) => module.lessons.map((lesson) => lesson))
		.find((lesson) => lesson.name === page)?.video;

	const module = meta.modules.find((mod) =>
		mod.lessons.find((lesson) => lesson.name == page)
	) as CourseModule;
	if (!module) throw Error("Module not found");
	function getNextLesson() {
		let mod = module;
		if (
			mod.lessons.findIndex((lesson) => lesson.name == page) ==
			mod.lessons.length - 1
		) {
			// go to first lesson of next mod
			mod = meta.modules[meta.modules.indexOf(mod!) + 1];
			return {
				name: mod.lessons[mod.lessons.length - 1].name,
				module: mod.name,
			};
		} else {
			return {
				name: mod!.lessons[
					mod.lessons.findIndex((lesson) => lesson.name == page) + 1
				].name,
				module: mod!.name,
			};
		}
	}

	function getPreviousLesson() {
		if (
			meta.modules.indexOf(module!) == 0 &&
			module.lessons.findIndex((lesson) => lesson.name == page) == 0
		)
			return null;
		let mod = module;
		if (module.lessons.findIndex((lesson) => lesson.name == page) == 0) {
			// go to last lesson of previous mod
			mod = meta.modules[meta.modules.indexOf(mod) - 1];
			return {
				name: mod!.lessons[mod.lessons.length - 1].name,
				module: mod!.name,
			};
		} else {
			return {
				name: mod!.lessons[
					mod.lessons.findIndex((lesson) => lesson.name == page) - 1
				].name,
				module: mod!.name,
			};
		}
	}
	return (
		<>
			<Head>
				<link
					rel="stylesheet"
					href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css"
				/>
			</Head>
			<CoursesLayout meta={meta} matter={matter}>
				{lessonVideo && (
					<video
						src={`https://github.com/Arafa-Tech-Foundation/Courses/raw/main/${meta.course}/static/${lessonVideo}`}
						controls
					/>
				)}
				<article className="prose mx-auto my-8">
					<MDXRemote
						{...source}
						components={{
							a: (props) => (
								<a
									target="_blank"
									rel="noreferrer"
									className="text-primary"
									{...props}
								/>
							),
							pre: (props) => {
								// @ts-ignore
								props = props.children.props;
								console.log(props);
								const language =
									props.className?.replace("language-", "") ??
									"javascript";
								return (
									<pre
										className={props.className}
										tabIndex={0}
									>
										<code
											className={clsx(
												props.className,
												"font-bold"
											)}
											dangerouslySetInnerHTML={{
												__html: Prism.highlight(
													props.children as string,
													Prism.languages[language],
													language
												),
											}}
										/>
									</pre>
								);
							},
							code: (props) => (
								<span
									className="bg-primary font-bold text-primary-content px-2 py-0.5 rounded"
									{...props}
								/>
							),
						}}
					/>
					<div className="flex flex-row w-full gap-4 my-8 justify-center">
						{getPreviousLesson() && (
							<Link
								className="btn btn-primary grow"
								href={`/courses/${meta.course}/${
									getPreviousLesson()?.name || ""
								}`}
							>
								Previous Lesson:{" "}
								{prettify(getPreviousLesson()?.name || "")}
							</Link>
						)}
						<Link
							className="btn btn-primary grow"
							href={`/courses/${meta.course}/${
								getNextLesson().name
							}`}
							// onClick={nextPage}
						>
							Next Lesson: {prettify(getNextLesson().name)}
						</Link>
					</div>
				</article>
			</CoursesLayout>
		</>
	);
}

export function prettify(str: string) {
	return str
		.split("_")
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(" ");
}

export async function getStaticProps({
	params,
}: {
	params: { course: string; page: string };
}) {
	const url = `https://raw.githubusercontent.com/Arafa-Tech-Foundation/Courses/main/${params.course}/${params.page}.mdx`;
	const res = await axios.get(url, {
		headers: {
			Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
		},
	});

	const metaUrl = `https://raw.githubusercontent.com/Arafa-Tech-Foundation/Courses/main/${params.course}/.metadata.json`;
	const metaRes = await axios.get(metaUrl, {
		headers: {
			Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
		},
	});

	const meta: CourseMeta = metaRes.data;

	// replace relative image paths with absolute paths
	const markdown = res.data.replaceAll('src="./', `src="${imageUrl}`);

	const { content, data } = matter(markdown);

	// TODO: add code highlighting plugin
	const source = await serialize(content);

	return {
		props: {
			source,
			meta,
			matter: data,
			page: params.page,
		},
		revalidate: 60 * 60,
	};
}

export async function getStaticPaths() {
	const courses = await getRepositoryFolders();

	const files = courses.map(async (course) => {
		return getFolderContents(course);
	});

	const pages = await Promise.all(files);

	// compile the courses into a flat array of paths
	const paths = courses.flatMap((course, index) => {
		return pages[index].map((page) => ({
			// remove filetype to prevent overlap in url
			params: { course, page: page.replace(".mdx", "") },
		}));
	});

	return {
		paths,
		fallback: false,
	};
}
